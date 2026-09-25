import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHigh, buildLow } from '../labs/baking/mesh.js';
import { buildBVH, intersect } from '../labs/baking/bvh.js';
import { createBake, rasterize, decodeTexel } from '../labs/baking/bake.js';
import { STAGES, startState, bakeInto } from '../labs/baking/stages.js';

// A lighter high poly and small images keep the tests fast; the lab uses N = 96 and 256 px.
const high = buildHigh(48), geo = { high, bvh: buildBVH(high.positions, high.indices) };
const RES = 64;
const bake = (low, opts) => createBake(low, high, geo.bvh, { res: RES, ...opts }).run();
const texel = (job, x, y) => { const i = (y * job.res + x) * 4; return [job.img[i], job.img[i + 1], job.img[i + 2]]; };

test('ray caster: the BVH finds the nearest hit, on both sides', () => {
  const hitIn = intersect(geo.bvh, 0, 0, 3, 0, 0, -1, 0, 1e9);
  assert.ok(hitIn && hitIn.t > 1.8 && hitIn.t < 2.2, 'from outside, the +Z face is about 1 away from the cube');
  const hitOut = intersect(geo.bvh, 0, 0, 0, 0, 0, 1, 0, 1e9);
  assert.ok(hitOut && hitOut.t > 0.9 && hitOut.t < 1.2, 'from the centre, the back of the same face is hit too');
  assert.equal(intersect(geo.bvh, 0, 0, 3, 0, 0, 1, 0, 1e9), null, 'a ray pointing away hits nothing');
});

test('low poly: 12 triangles, unique or stacked UVs', () => {
  const low = buildLow();
  assert.equal(low.indices.length / 3, 12);
  assert.equal(rasterize(low, RES).owners.filter(o => o > 1).length, 0, 'unique UVs never overlap');
  assert.ok(rasterize(buildLow({ uv: 'overlap' }), RES).owners.filter(o => o > 1).length > 100, 'stacked UVs overlap');
});

test('a self bake is flat blue; a bake from the high poly has detail', () => {
  const low = buildLow();
  const self = bake(low, { type: 'NORMAL' });
  const R = self.raster, filled = [...R.tri.keys()].filter(i => R.tri[i] >= 0);
  assert.ok(filled.every(i => Math.abs(self.img[i * 4] - 128) <= 1 && Math.abs(self.img[i * 4 + 1] - 128) <= 1 && self.img[i * 4 + 2] >= 254), 'without Selected to Active every texel is (0.5, 0.5, 1)');
  const hb = bake(low, { type: 'NORMAL', selectedToActive: true, cage: true, extrusion: 0.1 });
  assert.ok(filled.some(i => hb.img[i * 4] > 180), 'bevels and bolts tilt the normals');
  assert.equal(hb.stats.misses + hb.stats.wrongHits, 0);
});

test('extrusion and cage: the teaching problems appear and go away', () => {
  const low = buildLow();
  const e0 = bake(low, { type: 'NORMAL', selectedToActive: true, extrusion: 0 });
  assert.ok(e0.stats.wrongHits > 0, 'extrusion 0: the rays start inside the bolts');
  const flat = bake(low, { type: 'NORMAL', selectedToActive: true, extrusion: 0.1 });
  assert.equal(flat.stats.wrongHits, 0);
  assert.ok(flat.stats.misses > 0, 'hard edges without a cage miss the rounded corners');
  const cage = bake(low, { type: 'NORMAL', selectedToActive: true, extrusion: 0.1, cage: true });
  assert.equal(cage.stats.misses, 0, 'the cage closes the corners');
  assert.ok(cage.stats.maxRayAngle > 30, 'the cage tilts the rays near the corners');
});

test('tangent space: swizzle G −Y flips the green channel only', () => {
  const low = buildLow(), o = { type: 'NORMAL', selectedToActive: true, cage: true, extrusion: 0.1 };
  const a = bake(low, o), b = bake(low, { ...o, swizzle: ['+X', '-Y', '+Z'] });
  let checked = 0;
  for (let i = 0; i < RES * RES; i++) if (a.raster.tri[i] >= 0) {
    assert.ok(Math.abs(a.img[i * 4] - b.img[i * 4]) <= 1);
    assert.ok(Math.abs(a.img[i * 4 + 1] + b.img[i * 4 + 1] - 255) <= 2);
    checked++;
  }
  assert.ok(checked > 1000);
  assert.deepEqual(decodeTexel(128, 128, 255).map(v => Math.round(v * 10) / 10), [0, 0, 1]);
});

test('margin fills the texels around the islands', () => {
  const low = buildLow();
  const m0 = bake(low, { type: 'NORMAL', margin: 0 }), m8 = bake(low, { type: 'NORMAL', margin: 8 });
  const count = j => { let n = 0; for (let i = 0; i < RES * RES; i++) if (j.img[i * 4 + 3]) n++; return n; };
  assert.ok(count(m8) > count(m0) * 1.2);
  assert.deepEqual(texel(m8, 32, 16), texel(m0, 32, 16), 'texels inside the islands do not change');
});

test('AO and diffuse: grooves are darker, colour only has no light', () => {
  const low = buildLow(), o = { selectedToActive: true, cage: true, extrusion: 0.1 };
  const ao = bake(low, { ...o, type: 'AO', samples: 16 });
  const vals = []; for (let i = 0; i < RES * RES; i++) if (ao.raster.tri[i] >= 0) vals.push(ao.img[i * 4]);
  assert.ok(Math.min(...vals) < 170 && Math.max(...vals) > 230, 'AO has dark and bright texels');
  const col = bake(low, { ...o, type: 'DIFFUSE', passes: { direct: false, indirect: false, color: true } });
  const lit = bake(low, { ...o, type: 'DIFFUSE' });
  let differ = 0; for (let i = 0; i < RES * RES; i++) if (col.raster.tri[i] >= 0 && Math.abs(col.img[i * 4] - lit.img[i * 4]) > 8) differ++;
  assert.ok(differ > 500, 'baked light changes the colour');
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const { state, prebake } = startState(step), flags = {};
    for (const p of prebake) { const b = bakeInto(state, geo, p.type, { res: RES, ...p.extra }); b.job.run(); b.commit(); }
    assert.equal(!!step.check(state, flags), false, `${step.id} starts unsolved`);
    for (const t of step.solve(state, flags)) { const b = bakeInto(state, geo, t, { res: RES }); b.job.run(); b.commit(); }
    assert.equal(!!step.check(state, flags), true, `${step.id} is solved by its solution`);
  }
});
