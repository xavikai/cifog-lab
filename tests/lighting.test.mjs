import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackbody, luminance, irradiance, measure, apparentSize, worldIrradiance, spotFactor, falseColorBand, FALSE_COLOR, MIDDLE_GREY } from '../labs/lighting/light.js';
import { STAGES, startState, defaultState } from '../labs/lighting/stages.js';

const near = (a, b, e) => Math.abs(a - b) <= e;
const probe = { p: [0, 1.55, 0.2], n: [0, 0, 1], onHead: true };
const base = o => ({ on: true, type: 'POINT', power: 100, strength: 1, radius: 0, angle: 1, spotSize: 45, blend: 0, shape: 'SQUARE', size: 0.01, sizeY: 0.01, az: 0, el: 0, dist: 1, target: 'head', colorMode: 'rgb', color: [1, 1, 1], ...o });

test('blackbody: warm below daylight, cool above, luminance 1', () => {
  const warm = blackbody(3200), day = blackbody(6500), cool = blackbody(10000);
  assert.ok(warm[0] > warm[2] * 2, 'tungsten is orange');
  assert.ok(near(day[0], day[2], 0.1) && near(day[0], 1, 0.1), 'about 6500 K is white');
  assert.ok(cool[2] > cool[0], 'a blue sky is blue');
  for (const c of [warm, day, cool]) assert.ok(near(luminance(c), 1, 1e-6));
});

test('inverse square law, sun, spot and area', () => {
  const E1 = irradiance(base({ dist: 1.2 }), probe), E2 = irradiance(base({ dist: 2.2 }), probe);
  assert.ok(near(E1 / E2, (2.2 - 0.2) ** 2 / (1.2 - 0.2) ** 2, 0.01), 'twice the distance, a quarter of the light');
  assert.ok(near(irradiance(base({ type: 'SUN', strength: 3, dist: 1 }), probe), irradiance(base({ type: 'SUN', strength: 3, dist: 9 }), probe), 1e-9), 'the sun does not fall off');
  const point = irradiance(base({ dist: 3 }), probe), area = irradiance(base({ type: 'AREA', dist: 3 }), probe);
  assert.ok(near(area / point, 4, 0.05), 'a small area light puts 4× more light on its axis than a point light of the same power');
  const spot = base({ type: 'SPOT', spotSize: 40, blend: 0.2 });
  assert.equal(spotFactor(spot, [0, 0, -1]), 1);
  assert.equal(spotFactor(spot, [Math.sin(0.4), 0, -Math.cos(0.4)]), 0, 'outside the cone');
  assert.ok(near(apparentSize(base({ type: 'AREA', size: 1, dist: 1 })), 53.13, 0.01));
});

test('world: uniform colour and HDRI rotation', () => {
  const w = { mode: 'color', color: [0.1, 0.1, 0.1], strength: 2 };
  assert.ok(near(worldIrradiance(w, [0, 0, 1]), Math.PI * 0.2, 1e-9));
  const h = rot => ({ mode: 'hdri', hdri: 'studio', rot, strength: 1 });
  assert.ok(worldIrradiance(h(0), [0, 0, 1]) > 3 * worldIrradiance(h(0), [0, 0, -1]), 'the softbox is in front');
  assert.ok(worldIrradiance(h(-90), [-1, 0, 0]) > 3 * worldIrradiance(h(-90), [1, 0, 0]), 'rotated to the camera left');
});

test('light meter: ratio, bounce card and False Color', () => {
  const s = defaultState();
  Object.assign(s.lights.key, { az: -90, el: 10, power: 18 });
  const m0 = measure(s);
  assert.equal(m0.keySide, 'L');
  s.card = { on: true, color: 'white', size: 1, az: 35, el: -20, dist: 0.55 };
  const m1 = measure(s);
  assert.ok(m1.ratio < m0.ratio / 2, 'the card fills the shadows');
  s.card.color = 'black';
  assert.ok(measure(s).ratio > m1.ratio, 'a black card does not');
  assert.equal(FALSE_COLOR[falseColorBand(0)].label, '±0.5');
  assert.ok(falseColorBand(Math.log2(0.36 / MIDDLE_GREY)) > falseColorBand(0));
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startState(step), flags = {};
    assert.equal(!!step.check(s, measure(s), flags), false, `${step.id} starts unsolved`);
    step.solve(s, flags);
    assert.equal(!!step.check(s, measure(s), flags), true, `${step.id} is solved by its solution`);
  }
});
