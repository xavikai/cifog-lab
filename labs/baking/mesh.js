// Baking Lab: the crate. A low poly cube (12 triangles, with UVs, normals and tangents) and a
// high poly version with bevelled edges, bolts, grooves, a plate and vent slots. Pure maths, no DOM.
// Coordinates: y is up (three.js). Sizes in metres; the crate is 2 m wide.

export const BEVEL = 0.12;
export const BOLT_H = 0.06;
export const GROOVE_D = 0.04;
export const PLATE_H = 0.03;

// Each face: normal n, and u, v directions (u × v = n). The UV islands follow u (right) and v (up).
export const FACES = [
  { id: '+X', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { id: '-X', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { id: '+Y', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { id: '-Y', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { id: '+Z', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { id: '-Z', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

// ─── The details of each face, as a height field over (s, t) ∈ [-1, 1]² ─────
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const dome = (s, t, cx, cy, r, h) => { const d2 = ((s - cx) ** 2 + (t - cy) ** 2) / (r * r); return d2 < 1 ? h * Math.sqrt(1 - d2) : 0; };
// a V-shaped groove, depth d, half width w, around distance 0
const groove = (dist, w, d) => { const a = Math.abs(dist); return a < w ? -d * (0.5 + 0.5 * Math.cos(Math.PI * a / w)) : 0; };
const boxDist = (s, t, hx, hy) => Math.max(Math.abs(s) - hx, Math.abs(t) - hy);
const BOLTS4 = [[-0.62, -0.62], [0.62, -0.62], [0.62, 0.62], [-0.62, 0.62]];

const PATTERNS = {
  '+X': (s, t) => { let h = groove(Math.max(Math.abs(s), Math.abs(t)) - 0.42, 0.045, GROOVE_D); for (const [x, y] of BOLTS4) h += dome(s, t, x, y, 0.1, BOLT_H); return { h, bolt: BOLTS4.some(([x, y]) => (s - x) ** 2 + (t - y) ** 2 < 0.01) }; },
  '-X': (s, t) => { const h = groove(Math.hypot(s, t) - 0.45, 0.045, GROOVE_D) + dome(s, t, 0, 0, 0.16, BOLT_H); return { h, bolt: s * s + t * t < 0.0256 }; },
  '+Y': (s, t) => ({ h: Math.min(slot(s, t, 0.6, 0.05), slot(s, t, 0.05, 0.6)), bolt: false }),
  '-Y': (s, t) => { let h = 0; for (const [x, y] of BOLTS4) h += dome(s, t, x, y, 0.1, BOLT_H); return { h, bolt: BOLTS4.some(([x, y]) => (s - x) ** 2 + (t - y) ** 2 < 0.01) }; },
  '+Z': (s, t) => { const d = boxDist(s, t, 0.45, 0.3); let h = PLATE_H * smooth(-d / 0.06); const bolts = [[-0.62, -0.62], [0.62, -0.62]]; for (const [x, y] of bolts) h += dome(s, t, x, y, 0.1, BOLT_H); return { h, bolt: bolts.some(([x, y]) => (s - x) ** 2 + (t - y) ** 2 < 0.01), plate: d < 0 }; },
  '-Z': (s, t) => { let h = 0; for (const y of [-0.3, 0, 0.3]) h = Math.min(h, slot(s, t - y, 0.55, 0.04)); return { h, bolt: false }; },
};
// a rounded slot: flat bottom, soft walls
function slot(s, t, hx, hy) { const d = boxDist(s, t, hx, hy); return d < 0.03 ? -GROOVE_D * smooth((0.03 - d) / 0.05) : 0; }
export function detail(face, s, t) {
  if (Math.max(Math.abs(s), Math.abs(t)) > 0.86) return { h: 0, bolt: false };
  return PATTERNS[face.id](s, t);
}
const PAINT = [0.78, 0.45, 0.18], STEEL = [0.66, 0.68, 0.72], PLATE = [0.95, 0.8, 0.22], DARK = [0.36, 0.22, 0.1];
export function colorAt(face, s, t) {
  const d = detail(face, s, t);
  if (d.bolt) return STEEL;
  if (d.plate) return (Math.floor((s + t) * 6) & 1) ? PLATE : [0.12, 0.12, 0.12];
  if (d.h < -0.005) return DARK;
  return PAINT;
}

// ─── Geometry helpers ────────────────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V3 = { add, mul, sub, cross, dot, norm };

// Point of the high poly surface for a face and (s, t). The box has rounded edges (a rounded box),
// and the details are pushed along the surface normal.
export function highPoint(face, s, t) {
  const q = add(add(face.n, mul(face.u, s)), mul(face.v, t));
  const a = 1 - BEVEL, c = q.map(x => Math.max(-a, Math.min(a, x)));
  const n0 = norm(sub(q, c));
  const p0 = add(c, mul(n0, BEVEL));
  return add(p0, mul(n0, detail(face, s, t).h));
}

export function buildHigh(N = 96) {
  const verts = (N + 1) * (N + 1) * 6;
  const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const idx = new Uint32Array(N * N * 6 * 6);
  let vi = 0, ii = 0;
  const e = 1e-3;
  FACES.forEach(face => {
    const base = vi;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const s = -1 + 2 * i / N, t = -1 + 2 * j / N;
      const p = highPoint(face, s, t);
      const ds = sub(highPoint(face, s + e, t), highPoint(face, s - e, t)), dt = sub(highPoint(face, s, t + e), highPoint(face, s, t - e));
      const n = norm(cross(ds, dt));
      pos.set(p, vi * 3); nrm.set(n, vi * 3); col.set(colorAt(face, s, t), vi * 3); vi++;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx[ii++] = a; idx[ii++] = b; idx[ii++] = d; idx[ii++] = a; idx[ii++] = d; idx[ii++] = c;
    }
  });
  return { positions: pos, normals: nrm, colors: col, indices: idx, triCount: idx.length / 3 };
}

// ─── Low poly ────────────────────────────────────────────────────────────────
// uv: 'unique' (six islands, one per face, with UV seams on every edge) or 'overlap' (all faces on top of each other).
// shading: 'flat' (hard edges), 'smooth' (averaged normals) or 'auto' (Auto Smooth 30°: on a cube, every edge is sharp).
export const ISLAND = 0.15; // half size of an island in UV space
export function islandOf(fi, layout) {
  if (layout === 'overlap') return { cx: 0.5, cy: 0.5, r: 0.45 };
  const col = fi % 3, row = Math.floor(fi / 3);
  return { cx: (col + 0.5) / 3, cy: (row + 0.5) / 2, r: ISLAND };
}
export function buildLow({ uv = 'unique', shading = 'flat' } = {}) {
  const pos = [], nrm = [], tan = [], uvs = [], faceOf = [], st = [], cage = [];
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  FACES.forEach((face, fi) => {
    const isl = islandOf(fi, uv);
    for (const [s, t] of CORNERS) {
      const p = add(add(face.n, mul(face.u, s)), mul(face.v, t));
      const n = shading === 'smooth' ? norm(p) : face.n;
      // tangent = the direction of +U on the surface, made perpendicular to the normal (MikkTSpace-like)
      const T = norm(sub(face.u, mul(n, dot(face.u, n))));
      pos.push(...p); nrm.push(...n); tan.push(...T, 1); cage.push(...norm(p)); // cage: averaged normals, one per corner
      uvs.push(isl.cx + s * isl.r, isl.cy + t * isl.r);
      faceOf.push(fi); st.push(s, t);
    }
  });
  const idx = [];
  for (let f = 0; f < 6; f++) { const b = f * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nrm), cageNormals: new Float32Array(cage), tangents: new Float32Array(tan), uvs: new Float32Array(uvs),
    indices: new Uint32Array(idx), faceOf: new Uint8Array(faceOf), st: new Float32Array(st), uv, shading,
  };
}
