// Trim Sheet Lab: paints the medieval trim sheet (colour and OpenGL normal map) on canvases.
// Every strip repeats every 1024 px in x, so it tiles in U.
import { SIZE, stripsOf, PALETTES, DEFAULT_STRIPS, DENSITY } from './sheet.js';

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// Value noise, periodic in x over 1024 px. `cell` must divide 1024.
function noise(x, y, cell, seed = 1) {
  const n = SIZE / cell, fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const at = (a, b) => hash(((a % n) + n) % n, b, seed);
  const s = t => t * t * (3 - 2 * t), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const wrapDist = (x, e) => { const d = Math.abs(((x - e) % SIZE + SIZE) % SIZE); return Math.min(d, SIZE - d); };

// Each painter returns [height 0–1, r, g, b] for a pixel at x and local row y of a strip H px tall.
function woodGrain(x, y, seed) { return Math.sin((y + 7 * noise(x, y, 128, seed) + 3 * noise(x, y, 32, seed + 1)) * 0.85) * 0.5 + 0.5; }
const PAINT = {
  plank(x, y, H, p) {
    const bh = H / 2, b = Math.floor(y / bh), yb = y - b * bh, jx = (b * 371 + 97) % 512;
    const dj = Math.min(wrapDist(x, jx), wrapDist(x, jx + 512)), edge = Math.min(yb, bh - 1 - yb, dj);
    if (edge < 1.5) return [0.05, ...mul(p.wood2, 0.35)];
    const g = woodGrain(x, y + b * 40, 3 + b), n = noise(x, y, 64, 9 + b);
    const knot = Math.hypot(wrapDist(x, 280 + b * 233) / 30, (yb - bh * 0.46) / 12);
    const knotRing = knot < 2.2 ? 0.5 + 0.5 * Math.cos(knot * 8) : 0;
    const h = 0.5 + 0.33 * sstep(0, 7, edge) + 0.055 * g - (knot < 0.55 ? 0.18 : 0);
    const tone = (0.84 + 0.22 * noise(x, y, 256, 20 + b)) * (knot < 2.2 ? 1 - 0.28 * knotRing : 1);
    return [h, ...mul(mix(p.wood, p.wood2, 0.2 + 0.48 * g * (0.6 + 0.4 * n)), tone)];
  },
  beam(x, y, H, p) {
    const e = Math.min(y, H - 1 - y), g = woodGrain(x * 0.8, y * 1.3, 31);
    const crack = Math.abs(noise(x, y * 4, 128, 40) - 0.5) < 0.012 && noise(x, y, 256, 41) > 0.55 && e > 10;
    const h = 0.45 + 0.45 * sstep(0, 14, e) - (crack ? 0.25 : 0) + 0.03 * g;
    const c = mix(mul(p.wood, 0.8), p.wood2, 0.35 + 0.45 * g);
    return [h, ...mul(c, (crack ? 0.45 : 1) * (0.75 + 0.25 * sstep(0, 14, e)))];
  },
  stone(x, y, H, p) {
    const starts = [0, 300, 512, 792], widths = [300, 212, 280, 232];
    let k = 0; for (let i = 0; i < 4; i++) if (x >= starts[i]) k = i;
    const dx = Math.min(x - starts[k], starts[k] + widths[k] - 1 - x), dm = Math.min(dx, y - 1, H - 2 - y);
    if (dm < 3) return [0.08, ...mul(p.stone2, 0.54 + 0.16 * noise(x, y, 8, 5))];
    const chip = noise(x, y, 16, 11 + k) * 0.6 + noise(x, y, 4, 12) * 0.4;
    const crackX = starts[k] + widths[k] * (0.28 + 0.12 * hash(k, 3, 61)) + y * 0.28 + 9 * (noise(x, y, 32, 77) - 0.5);
    const crack = k === 1 && y > H * 0.22 && y < H * 0.78 && Math.abs(x - crackX) < 1.5;
    const h = 0.5 + 0.35 * sstep(3, 14, dm) + 0.13 * chip - (crack ? 0.24 : 0);
    const tone = 0.78 + 0.29 * hash(k, 7, 3) + 0.18 * (noise(x, y, 64, 13 + k) - 0.5);
    const bevel = dm < 11 ? 1.12 - 0.24 * sstep(3, 11, dm) : 0.88;
    return [h, ...mul(mix(p.stone, p.stone2, 0.58 * noise(x, y, 32, 14)), tone * bevel * (crack ? 0.48 : 1))];
  },
  molding(x, y, H, p) {
    const t = (y + 0.5) / H;
    let h;
    if (t < 0.12) h = 0.95;
    else if (t < 0.55) h = 0.95 - 0.5 * (1 - Math.cos(Math.PI * (t - 0.12) / 0.43)) / 2;
    else if (t < 0.62) h = 0.35;
    else if (t < 0.82) h = 0.35 + 0.45 * Math.sin(Math.PI * (t - 0.62) / 0.2);
    else h = 0.6;
    h += 0.04 * noise(x, y, 8, 21);
    const streak = noise(x * 1, 0, 16, 22) * 0.15;
    return [h, ...mul(mul(p.stone, 1.08), (0.6 + 0.4 * h) * (0.95 - streak))];
  },
  iron(x, y, H, p) {
    const e = Math.min(y, H - 1 - y);
    let h = 0.45 + 0.15 * sstep(0, 5, e);
    const rx = wrapDist(x, 64 + Math.round((x - 64) / 128) * 128), r = Math.hypot(rx, y - H / 2 + 0.5);
    if (r < 9) h += 0.4 * Math.sqrt(1 - (r / 9) ** 2);
    const rust = sstep(0.55, 0.8, noise(x, y, 16, 31));
    const c = mix(p.iron, [128, 72, 40], rust * 0.7);
    return [h, ...mul(c, 0.8 + 0.4 * noise(x, y, 4, 32) * 0.5 + (r < 9 ? 0.15 : 0))];
  },
  plinth(x, y, H, p) {
    const j = wrapDist(x, 0) < 3 || wrapDist(x, 512) < 3;
    if (j && y > 12) return [0.1, ...mul(p.stone2, 0.5)];
    let h = 0.6 + 0.25 * noise(x, y, 8, 41) - 0.1 * noise(x, y, 2, 42);
    if (y < 14) h *= 0.35 + 0.65 * y / 14;
    return [h, ...mul(p.stone2, 0.72 + 0.35 * h)];
  },
  bevelWood(x, y, H, p) {
    const h = Math.sin(Math.PI * (y + 0.5) / H), g = woodGrain(x, y * 3, 51);
    return [h, ...mul(mix(p.wood, [230, 196, 150], 0.3), 0.85 + 0.2 * g)];
  },
  bevelStone(x, y, H, p) {
    const h = Math.sin(Math.PI * (y + 0.5) / H);
    return [h, ...mul(p.stone, 1.05 + 0.15 * noise(x, y, 8, 61))];
  },
};

function canvasOf(size = SIZE) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
// Paint a layout: returns { color, normal } canvases.
export function paintSheet(layout, pad, paletteId = 'oak') {
  const p = PALETTES[paletteId] || PALETTES.oak, { strips } = stripsOf(layout, pad);
  const N = SIZE, H = new Float32Array(N * N), C = new Uint8ClampedArray(N * N * 4), row = new Int16Array(N).fill(-1);
  for (const s of strips) {
    const paint = PAINT[s.type];
    for (let y = s.y0; y < Math.min(s.y1, N); y++) {
      row[y] = s.index;
      for (let x = 0; x < N; x++) { const o = paint(x, y - s.y0, s.px, p), i = y * N + x; H[i] = o[0]; C[i * 4] = o[1]; C[i * 4 + 1] = o[2]; C[i * 4 + 2] = o[3]; C[i * 4 + 3] = 255; }
    }
  }
  // Normals from the height, only inside each strip.
  const NM = new Uint8ClampedArray(N * N * 4), k = 3;
  for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const up = y > 0 && row[y - 1] === row[y] ? y - 1 : y, dn = y < N - 1 && row[y + 1] === row[y] ? y + 1 : y;
    for (let x = 0; x < N; x++) {
      const gx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], gy = (H[dn * N + x] - H[up * N + x]) * (2 / Math.max(1, dn - up));
      let nx = -gx * k, ny = gy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4; NM[i] = (nx * 0.5 + 0.5) * 255; NM[i + 1] = (ny * 0.5 + 0.5) * 255; NM[i + 2] = (nz * 0.5 + 0.5) * 255; NM[i + 3] = 255;
    }
  }
  // Padding: each half copies the edge row of the strip next to it. Unused rows: a grey checker.
  const copyRow = (from, to) => { C.copyWithin(to * N * 4, from * N * 4, (from + 1) * N * 4); NM.copyWithin(to * N * 4, from * N * 4, (from + 1) * N * 4); };
  for (let y = 0; y < N; y++) {
    if (row[y] >= 0) continue;
    let a = y; while (a >= 0 && row[a] < 0) a--;
    let b = y; while (b < N && row[b] < 0) b++;
    if (a >= 0 && b < N) { copyRow(y - a <= b - y ? a : b, y); continue; }
    if (a >= 0 && y - a <= pad) { copyRow(a, y); continue; }
    for (let x = 0; x < N; x++) { const i = (y * N + x) * 4, v = ((x >> 4) + (y >> 4)) % 2 ? 78 : 64; C[i] = C[i + 1] = C[i + 2] = v; C[i + 3] = 255; NM[i] = NM[i + 1] = 128; NM[i + 2] = 255; NM[i + 3] = 255; }
  }
  const color = canvasOf(), normal = canvasOf();
  color.getContext('2d').putImageData(new ImageData(C, N, N), 0, 0);
  normal.getContext('2d').putImageData(new ImageData(NM, N, N), 0, 0);
  return { color, normal };
}
// A tileable stone texture: the stone course repeated four times, for the "tileable" comparison.
export function paintTileable(paletteId = 'oak') {
  const layout = [0, 1, 2, 3].map(() => ({ type: 'stone', px: 256 }));
  return paintSheet(layout, 0, paletteId);
}
// A genuine one-off atlas: each face has its own patch of the image. The source materials
// give the surfaces a shared art direction, while the per-face wear is painted only once.
export function paintUnique(atlas, sourceColor, sourceNormal) {
  const size = atlas.size, color = canvasOf(size), normal = canvasOf(size), g = color.getContext('2d'), n = normal.getContext('2d');
  g.fillStyle = '#252b30'; g.fillRect(0, 0, size, size);
  n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, size, size);
  for (const zone of atlas.zones) {
    g.fillStyle = '#323a3e'; g.fillRect(zone.x + 1, 1, zone.w - 2, 27);
    g.fillStyle = '#e6dbca'; g.font = 'bold 15px Segoe UI, sans-serif';
    g.fillText(zone.prop.toUpperCase() + ' · UNIQUE', zone.x + 9, 19);
    g.fillStyle = '#4a5052'; g.fillRect(zone.x, 0, 2, size);
  }
  for (const r of atlas.rects) {
    if (!r) continue;
    const strip = DEFAULT_STRIPS.find(s => s.type === r.type);
    if (!strip) continue;
    const sw = Math.min(SIZE, Math.max(2, Math.round(r.w * DENSITY / atlas.density)));
    const sh = Math.min(strip.px, Math.max(2, Math.round(r.h * DENSITY / atlas.density)));
    const sx = Math.round(hash(r.face, 7, 43) * (SIZE - sw));
    const sy = strip.y0 + Math.round(hash(r.face, 11, 97) * Math.max(0, strip.px - sh));
    g.drawImage(sourceColor, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
    n.drawImage(sourceNormal, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
    // Distinct marks make the one-to-one UV assignment visible on the model.
    const patina = hash(r.face, 13, 31), marks = Math.max(1, Math.round(r.w * r.h / 2200));
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    for (let i = 0; i < marks; i++) {
      const px = r.x + hash(r.face, i * 17 + 3, 67) * r.w;
      const py = r.y + hash(r.face, i * 19 + 5, 71) * r.h;
      const radius = 2 + hash(r.face, i + 9, 79) * Math.min(13, r.w / 4);
      g.fillStyle = r.prop === 'chest' || r.prop === 'beam' ? 'rgba(38,22,11,.14)' : 'rgba(51,42,29,.16)';
      g.beginPath(); g.ellipse(px, py, radius, Math.max(1, radius * .35), patina, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(24,27,29,.75)'; g.lineWidth = 2; g.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
  }
  return { color, normal };
}
// Mip level m of a canvas, made by halving it m times (each texel averages the ones below it).
export function mip(canvas, m) {
  let src = canvas;
  for (let i = 0; i < m; i++) { const c = canvasOf(src.width / 2), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); src = c; }
  return src;
}
