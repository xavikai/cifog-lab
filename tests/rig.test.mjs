import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import * as R from '../labs/rig/rig.js';
import { STAGES, rigFor } from '../labs/rig/stages.js';

const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

test('rest frames follow Blender roll 0 and XYZ Euler round-trips', () => {
  const arm = R.makeRig('arm');
  const ua = arm.bones[arm.index.UpperArm];
  const X = new Vector3(1, 0, 0).applyQuaternion(ua.restQ), Z = new Vector3(0, 0, 1).applyQuaternion(ua.restQ);
  assert.ok(near(Z.y, 1), 'a horizontal bone has its Z axis up');
  assert.ok(near(X.z, 1), 'and its X axis towards the front');
  assert.deepEqual(R.rotFromQuat(R.quatFromRot([30, -20, 45])), [30, -20, 45]);
  assert.deepEqual(R.toBlender(R.fromBlender([1, 2, 3])), [1, 2, 3]);
});

test('FK: children follow their parents; rotating around the local X axis raises the arm', () => {
  const arm = R.makeRig('arm'), st = R.defaultState(arm);
  st.pose.UpperArm.rot = [90, 0, 0];
  const { W } = R.solve(arm, st);
  const tip = R.posOf(arm, W, 'Hand', 't');
  assert.ok(near(tip.x, 0.7) && near(tip.y, 3.2 + 3.05), 'the whole arm points up');
  st.pose.Forearm.rot = [90, 0, 0];
  const e = R.posOf(arm, R.solve(arm, st).W, 'UpperArm', 't');
  assert.ok(near(e.y, 4.5), 'the elbow does not move when only the Forearm rotates');
});

test('IK: the tip reaches the target; without a pole a straight leg bends its knee backwards', () => {
  const leg = R.makeRig('leg'), st = R.defaultState(leg);
  st.ik = { owner: 'Shin', target: 'IK_Foot', pole: null, poleAngle: 0, chain: 2, influence: 1 };
  R.addWorldLocation(leg, st, R.solve(leg, st).W, 'IK_Foot', new Vector3(0, 0.6, 0.4));
  let { info } = R.solve(leg, st);
  assert.ok(info.dist < 1e-4);
  assert.ok(info.kneeDir.z < -0.9, 'knee backwards');
  st.ik.pole = 'Knee_Pole';
  assert.ok(Math.abs(R.solve(leg, st).info.kneeDir.x) > 0.99, 'Pole Angle 0: the knee points sideways');
  st.ik.poleAngle = -90;
  assert.ok(R.solve(leg, st).info.kneeDir.z > 0.95, 'Pole Angle -90°: the knee points at the pole');
});

test('IK options: Chain Length 0 rotates the Hips, 1 only aims the Shin; Influence 0 gives the FK pose back', () => {
  const leg = R.makeRig('leg'), st = R.defaultState(leg);
  st.ik = { owner: 'Shin', target: 'IK_Foot', pole: null, poleAngle: 0, chain: 0, influence: 1 };
  R.addWorldLocation(leg, st, R.solve(leg, st).W, 'IK_Foot', new Vector3(0, 0.6, 0.4));
  const hipsTail = R.posOf(leg, R.solve(leg, st).W, 'Hips', 't');
  assert.ok(hipsTail.distanceTo(new Vector3(0, 2.75, 0)) > 0.02, 'the Hips are part of the chain');
  st.ik.chain = 1; assert.ok(R.solve(leg, st).info.dist > 0.1, 'one bone cannot reach');
  st.ik.chain = 2; st.ik.influence = 0;
  const shinTail = R.posOf(leg, R.solve(leg, st).W, 'Shin', 't');
  assert.ok(near(shinTail.y, 0.15) && near(shinTail.z, 0), 'influence 0: straight FK leg');
});

test('the target out of reach: the chain points at it, straight', () => {
  const leg = R.makeRig('leg'), st = R.defaultState(leg);
  st.ik = { owner: 'Shin', target: 'IK_Foot', pole: 'Knee_Pole', poleAngle: -90, chain: 2, influence: 1 };
  R.addWorldLocation(leg, st, R.solve(leg, st).W, 'IK_Foot', new Vector3(0, -2, 0));
  const { info } = R.solve(leg, st);
  assert.equal(info.reached, false); assert.ok(near(info.dist, 2, 0.01));
});

test('reachFK finds FK rotations that touch a point', () => {
  const arm = R.makeRig('arm'), st = R.defaultState(arm), p = new Vector3(2.2, 2.0, 1.2);
  R.reachFK(arm, st, ['UpperArm', 'Forearm', 'Hand'], p);
  assert.ok(R.posOf(arm, R.solve(arm, st).W, 'Hand', 't').distanceTo(p) < 0.01);
});

test('every step starts unsolved and its solution solves it', () => {
  for (const stg of STAGES) {
    const rig = rigFor(stg);
    for (const s of stg.steps) {
      const flags = {}, st = s.start(rig);
      const ctx = () => { const { W, info } = R.solve(rig, st); return { rig, W, info, flags }; };
      assert.equal(!!s.check(st, ctx()), false, `${s.id} starts unsolved`);
      s.solve(st, rig, flags);
      assert.ok(s.check(st, ctx()), `${s.id} solved`);
    }
  }
});
