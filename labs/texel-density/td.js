// Texel Density Lab: props as quad meshes with UV islands, and the maths of texel density. Pure JS, no DOM.
// A mesh is { pos, faces: [{ v:[4 ids], loc:[[s,t]×4], island }], islands: { id: { name, obj, pat, faces } }, objects, extras }.
// `loc` is the flat layout of a face in metres. UVs are stored per face corner: uv[face] = [[u,v]×4].
// Texel density = texture size × √(UV area ÷ 3D area), in px per metre.
export const RES = [256, 512, 1024, 2048, 4096];
export const MARGIN = 0.01;          // Pack Islands margin, in UV units (about 10 px on a 1K texture)
export const CHECKER = 64;           // one checker square covers 64 × 64 texels
export const TOL = 0.1;              // ±10 % counts as "on target"

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
export const cloneUV = uv => uv.map(f => f.map(p => [p[0], p[1]]));

// ─── Props ───────────────────────────────────────────────────────────────────
export const OBJECTS = {
  crate:   { name: 'Crate', size: '0.5 × 0.5 × 0.5 m' },
  wall:    { name: 'Wall', size: '3 × 2 × 0.25 m' },
  barrel:  { name: 'Barrel', size: 'Ø 0.6 × 0.9 m' },
  cabinet: { name: 'Cabinet', size: '1.2 × 0.8 × 0.5 m' },
  vending: { name: 'Vending machine', size: '0.9 × 1.9 × 0.8 m' },
};
// Pattern ids used by the texture shader (and by the pixel loupe).
export const PAT = { planks: 0, bricks: 1, staves: 2, cabinet: 3, vendFront: 4, vendSide: 5 };

function newMesh() { return { pos: [], faces: [], islands: {}, objects: {}, extras: [], keys: new Map() }; }
function vid(m, p) {
  const k = p.map(x => Math.round(x * 1e5)).join(',');
  if (!m.keys.has(k)) { m.keys.set(k, m.pos.length); m.pos.push(p); }
  return m.keys.get(k);
}
// A band of n quads: P(s, t) gives the 3D point, s from 0 to S, t from 0 to T (all in metres).
function band(m, obj, id, name, pat, P, S, T, n = 1) {
  const isl = m.islands[id] = { name, obj, pat, faces: [] };
  m.objects[obj].islands.push(id);
  for (let i = 0; i < n; i++) {
    const a = S * i / n, b = S * (i + 1) / n, c = [[a, 0], [b, 0], [b, T], [a, T]];
    isl.faces.push(m.faces.length);
    m.faces.push({ v: c.map(([s, t]) => vid(m, P(s, t))), loc: c.map(p => [p[0], p[1]]), island: id });
  }
}
// A box of w × h × d with its base centred on `o`, scaled by k. `faces` lists the sides that get UVs.
function box(m, obj, o, k, w, h, d, faces, pats = {}) {
  m.objects[obj] = { islands: [], origin: o };
  w *= k; h *= k; d *= k;
  const at = p => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];
  const F = {
    front:  ['Front', (s, t) => at([-w / 2 + s, t, d / 2]), w, h],
    back:   ['Back', (s, t) => at([w / 2 - s, t, -d / 2]), w, h],
    right:  ['Right side', (s, t) => at([w / 2, t, d / 2 - s]), d, h],
    left:   ['Left side', (s, t) => at([-w / 2, t, -d / 2 + s]), d, h],
    top:    ['Top', (s, t) => at([-w / 2 + s, h, d / 2 - t]), w, d],
    bottom: ['Bottom', (s, t) => at([-w / 2 + s, 0, -d / 2 + t]), w, d],
  };
  for (const f of faces) { const [name, P, S, T] = F[f]; band(m, obj, `${obj}.${f}`, name, pats[f] ?? pats.all, P, S, T); }
}
export function crate(m, o = [0, 0, 0], k = 1) { box(m, 'crate', o, k, 0.5, 0.5, 0.5, ['front', 'back', 'right', 'left', 'top', 'bottom'], { all: PAT.planks }); }
// The back of the wall stands against another wall, so it has no UVs.
export function wall(m, o = [0, 0, 0], k = 1) {
  box(m, 'wall', o, k, 3, 2, 0.25, ['front', 'top', 'left', 'right'], { all: PAT.bricks });
  m.extras.push({ kind: 'quad', obj: 'wall', pts: [[1.5, 0, -0.125], [-1.5, 0, -0.125], [-1.5, 2, -0.125], [1.5, 2, -0.125]].map(p => [o[0] + p[0] * k, o[1] + p[1] * k, o[2] + p[2] * k]) });
}
export const BARREL = { r: 0.3, h: 0.9, n: 16 };
export function barrel(m, o = [0, 0, 0], k = 1) {
  m.objects.barrel = { islands: [], origin: o };
  const R = BARREL.r * k, H = BARREL.h * k, C = 2 * Math.PI * R;
  band(m, 'barrel', 'barrel.side', 'Side', PAT.staves, (s, t) => { const a = s / C * Math.PI * 2; return [o[0] + R * Math.cos(a), o[1] + t, o[2] - R * Math.sin(a)]; }, C, H, BARREL.n);
  m.extras.push({ kind: 'disk', obj: 'barrel', center: [o[0], o[1] + H, o[2]], r: R });
}
export function cabinet(m, o = [0, 0, 0], k = 1) { box(m, 'cabinet', o, k, 1.2, 0.8, 0.5, ['front', 'back', 'top', 'left', 'right'], { all: PAT.cabinet }); }
export function vending(m, o = [0, 0, 0], k = 1) { box(m, 'vending', o, k, 0.9, 1.9, 0.8, ['front', 'left', 'right', 'top', 'back'], { all: PAT.vendSide, front: PAT.vendFront }); }

const BUILD = { crate, wall, barrel, cabinet, vending };
export const SCENES = {
  crate:   [['crate', [0, 0, 0]]],
  wall:    [['wall', [0, 0, 0]]],
  cabinet: [['cabinet', [0, 0, 0]]],
  vending: [['vending', [0, 0, 0]]],
  trio:    [['crate', [-2.1, 0, 0.7]], ['wall', [0, 0, -0.7]], ['barrel', [2.0, 0, 0.5]]],
  shop:    [['crate', [-2.3, 0, 0.8]], ['wall', [-0.6, 0, -0.8]], ['barrel', [0.95, 0, 0.6]], ['vending', [2.35, 0, -0.35]]],
};
export function buildScene(name, scale = {}) {
  const m = newMesh();
  for (const [obj, o] of SCENES[name]) BUILD[obj](m, o, scale[obj] ?? 1);
  delete m.keys;
  return m;
}
export const objectsOf = name => SCENES[name].map(([o]) => o);

// ─── Measuring ───────────────────────────────────────────────────────────────
export function faceArea(m, f) {
  const [a, b, c, d] = m.faces[f].v.map(i => m.pos[i]);
  return len(cross(sub(c, a), sub(d, b))) / 2;
}
export function area2(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function bbox(uv, faces) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const f of faces) for (const [u, v] of uv[f]) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { u0, u1, v0, v1, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, w: u1 - u0, h: v1 - v0 };
}
export const islandFaces = (m, id) => m.islands[id].faces;
export const objectFaces = (m, obj) => m.objects[obj].islands.flatMap(id => m.islands[id].faces);
export function areas(m, uv, faces) {
  let a3 = 0, a2 = 0;
  for (const f of faces) { a3 += faceArea(m, f); a2 += Math.abs(area2(uv[f])); }
  return { a3, a2 };
}
// px per metre of a group of faces on a texture of `res` pixels.
export function density(m, uv, faces, res) {
  const { a3, a2 } = areas(m, uv, faces);
  return a3 > 0 ? Math.sqrt(a2 / a3) * res : 0;
}
export const islandDensity = (m, uv, id, res) => density(m, uv, islandFaces(m, id), res);
export const objectDensity = (m, uv, obj, res) => density(m, uv, objectFaces(m, obj), res);
// Size of a face (or island) in metres: the extent of its flat layout.
export function realSize(m, faces) {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const f of faces) for (const [s, t] of m.faces[f].loc) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  return { w: s1 - s0, h: t1 - t0 };
}
export const onTarget = (d, target, tol = TOL) => Math.abs(d / target - 1) <= tol;

// ─── UV transforms ───────────────────────────────────────────────────────────
export function mapUV(uv, faces, fn) { for (const f of faces) uv[f] = uv[f].map(p => fn(p[0], p[1])); return uv; }
export const translate = (uv, faces, du, dv) => mapUV(uv, faces, (u, v) => [u + du, v + dv]);
export const scale = (uv, faces, ku, kv, pu, pv) => mapUV(uv, faces, (u, v) => [pu + (u - pu) * ku, pv + (v - pv) * kv]);
export function rotate(uv, faces, deg, pu, pv) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return mapUV(uv, faces, (u, v) => [pu + (u - pu) * c - (v - pv) * s, pv + (u - pu) * s + (v - pv) * c]);
}
// The flat layout of a group of faces, with `d` UV units per metre.
export function ideal(m, uv, faces, d) { for (const f of faces) uv[f] = m.faces[f].loc.map(([s, t]) => [s * d, t * d]); return uv; }
// Put one island at `k` × the density `d`, centred on (cu, cv), turned `rot` degrees (for the start of a step).
export function placeIsland(m, uv, id, { d, cu, cv, k = 1, rot = 0 }) {
  const f = islandFaces(m, id);
  ideal(m, uv, f, d * k);
  let b = bbox(uv, f);
  if (rot) { rotate(uv, f, rot, b.cu, b.cv); b = bbox(uv, f); }
  return translate(uv, f, cu - b.cu, cv - b.cv);
}
// Average Islands Scale: every island gets the same density as the others, the total UV area stays the same.
export function averageIslandsScale(m, uv, ids) {
  const per = ids.map(id => ({ f: islandFaces(m, id), ...areas(m, uv, islandFaces(m, id)) }));
  const A2 = per.reduce((s, p) => s + p.a2, 0), A3 = per.reduce((s, p) => s + p.a3, 0);
  if (!A2 || !A3) return uv;
  const d = Math.sqrt(A2 / A3);
  for (const p of per) { const k = d / Math.sqrt(p.a2 / p.a3), b = bbox(uv, p.f); scale(uv, p.f, k, k, b.cu, b.cv); }
  return uv;
}
// Pack Islands: keep the sizes of the islands relative to each other, turn tall ones on their side,
// and make them as big as possible inside 0–1 with a margin (shelf packing).
export function pack(m, uv, ids, margin = MARGIN) {
  const items = ids.map(id => {
    const f = islandFaces(m, id); let b = bbox(uv, f);
    if (b.h > b.w + 1e-9) { rotate(uv, f, 90, b.cu, b.cv); b = bbox(uv, f); }
    translate(uv, f, -b.u0, -b.v0);
    return { id, f, w: b.w, h: b.h };
  });
  items.sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : 1));
  const layout = s => {
    let x = margin, y = margin, row = 0; const pos = [];
    for (const it of items) {
      const w = it.w * s, h = it.h * s;
      if (x + w > 1 - margin + 1e-12 && x > margin) { y += row + margin; x = margin; row = 0; }
      if (x + w > 1 - margin + 1e-12) return null;
      pos.push([x, y]); x += w + margin; row = Math.max(row, h);
    }
    return y + row <= 1 - margin + 1e-12 ? pos : null;
  };
  let lo = 0, hi = (1 - 2 * margin) / Math.max(...items.map(i => Math.max(i.w, i.h)), 1e-9);
  if (layout(hi)) lo = hi; else for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (layout(mid)) lo = mid; else hi = mid; }
  const pos = layout(lo);
  items.forEach((it, i) => { scale(uv, it.f, lo, lo, 0, 0); translate(uv, it.f, pos[i][0], 1 - pos[i][1] - it.h * lo); });
  return uv;
}
// Texel Density Checker's "Set TD": scale all the islands of an object so it reaches `target` px/m.
// It keeps the layout together and moves it back inside 0–1 when it can. Returns false if it no longer fits.
export function setTD(m, uv, obj, res, target) {
  const f = objectFaces(m, obj), d = density(m, uv, f, res);
  if (!d) return false;
  const k = target / d; let b = bbox(uv, f);
  scale(uv, f, k, k, b.cu, b.cv); b = bbox(uv, f);
  const du = b.w <= 1 ? Math.min(Math.max(0, -b.u0), 1 - b.u1) || (b.u0 < 0 ? -b.u0 : b.u1 > 1 ? 1 - b.u1 : 0) : 0.5 - b.cu;
  const dv = b.h <= 1 ? (b.v0 < 0 ? -b.v0 : b.v1 > 1 ? 1 - b.v1 : 0) : 0.5 - b.cv;
  translate(uv, f, du, dv);
  return b.w <= 1 + 1e-9 && b.h <= 1 + 1e-9;
}
// A fresh, packed UV layout for every object of a mesh (what Smart UV Project + Pack would give).
export function packedUV(m) {
  const uv = m.faces.map(() => [[0, 0], [0, 0], [0, 0], [0, 0]]);
  for (const obj of Object.keys(m.objects)) { const ids = m.objects[obj].islands; for (const id of ids) ideal(m, uv, islandFaces(m, id), 1); pack(m, uv, ids); }
  return uv;
}
// Density of a packed layout on a 1 px texture: multiply by the texture size to get px/m.
const d1Cache = new Map();
export function packedDensity1(obj) {
  if (!d1Cache.has(obj)) { const m = newMesh(); BUILD[obj](m); delete m.keys; d1Cache.set(obj, objectDensity(m, packedUV(m), obj, 1)); }
  return d1Cache.get(obj);
}
// Smallest texture that reaches `target` px/m with a packed layout.
export function minRes(obj, target, tol = 0.05) { return RES.find(r => packedDensity1(obj) * r >= target * (1 - tol)) ?? null; }

// ─── Checks ──────────────────────────────────────────────────────────────────
export function inside(uv, faces, eps = 1e-3) { const b = bbox(uv, faces); return b.u0 >= -eps && b.v0 >= -eps && b.u1 <= 1 + eps && b.v1 <= 1 + eps; }
// Two convex polygons overlap (separating axis test); touching edges do not count.
function polysOverlap(A, B, eps = 2e-4) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = a[1] - b[1], ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const d = (p[0] * nx + p[1] * ny) / l; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of B) { const d = (p[0] * nx + p[1] * ny) / l; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
  }
  return true;
}
// Pairs of islands that overlap in UV space.
export function overlaps(m, uv, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = islandFaces(m, ids[i]), B = islandFaces(m, ids[j]);
    const ba = bbox(uv, A), bb = bbox(uv, B);
    if (ba.u1 <= bb.u0 || bb.u1 <= ba.u0 || ba.v1 <= bb.v0 || bb.v1 <= ba.v0) continue;
    if (A.some(fa => B.some(fb => polysOverlap(uv[fa], uv[fb])))) out.push([ids[i], ids[j]]);
  }
  return out;
}
// Fraction of the 0–1 square covered by the islands of an object.
export function coverage(m, uv, obj) { return areas(m, uv, objectFaces(m, obj)).a2; }

// ─── Camera, screen and memory ───────────────────────────────────────────────
export const SCREEN = { w: 2560, h: 1440, fov: 60 };
// Pixels that one metre covers on screen, at distance d (metres), for the vertical FOV of the screen.
export const screenDensity = (d, s = SCREEN) => s.h / (2 * d * Math.tan(s.fov * Math.PI / 360));
export const CAMERAS = {
  strategy: { name: 'Strategy (top-down)', d: 10 },
  third:    { name: 'Third person', d: 2.5 },
  first:    { name: 'First person', d: 1.25 },
};
export const TARGETS = [64, 128, 256, 512, 1024, 2048];
// The right target for a camera: the smallest power of two that gives at least one texel per screen pixel.
export const rightTarget = d => TARGETS.find(t => t >= screenDensity(d) * 0.97) ?? TARGETS[TARGETS.length - 1];
// Texture set in memory: colour, normal and roughness, block-compressed at 1 byte per pixel, with mipmaps (+⅓).
export const setMB = res => 3 * res * res * (4 / 3) / (1024 * 1024);

// ─── Patterns (the same ones the shader paints) ──────────────────────────────
const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const line = (x, w) => { const d = Math.abs(fract(x + 0.5) - 0.5); return d < w ? 1 : 0; };
// Bricks: 21.5 × 6.5 cm with 1 cm of mortar, half-brick bond. p in metres. Returns sRGB 0–1.
export function brickColor(s, t) {
  const row = Math.floor(t / 0.075), x = s / 0.225 + (row % 2) * 0.5, col = Math.floor(x);
  const inMortar = fract(t / 0.075) > 0.8667 || fract(x) > 0.9556;
  if (inMortar) return [0.72, 0.70, 0.66];
  const h = hash(col, row), base = mix([0.62, 0.25, 0.17], [0.48, 0.18, 0.13], h);
  const speck = hash(Math.floor(s / 0.012), Math.floor(t / 0.012)) > 0.86 ? 0.75 : 1;
  return base.map(c => c * speck * (0.9 + 0.1 * line(s / 0.03 + h, 0.12)));
}
