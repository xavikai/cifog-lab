// Stages of the Rig Lab. Every step loads its own starting pose, so students can jump between steps.
import { Vector3 } from '../../vendor/three.module.js';
import { Quaternion } from '../../vendor/three.module.js';
import { makeRig, defaultState, cloneState, solve, posOf, rotAngle, reachFK, addWorldLocation, setWorldRotation, restBend } from './rig.js?v=3';

// The rig of a stage, with the knee bend (Edit Mode) of the state, if there is one.
export const rigFor = (stage, st) => makeRig(stage.rig, { knee: st?.knee || 0, kneeSide: st?.kneeSide || 0, roll: st?.roll || 0 });
export const KNEE_BEND = 0.05;   // the slight forward bend of the solutions (5 cm)

// A pose to copy (stage 1, step 2). Shown as a ghost.
export const GHOST_POSE = { UpperArm: [40, 0, -30], Forearm: [75, 0, 0], Hand: [20, 0, 10] };
// Stage 1, step 3: the hand starts on the cup.
const CUP_POSE = { UpperArm: [-20, 0, -40], Forearm: [10, 0, -55], Hand: [0, 0, -15] };
export function withPose(rig, pose) { const st = defaultState(rig); for (const [n, r] of Object.entries(pose)) st.pose[n].rot = [...r]; return st; }
export function cupPoint(rig) { const { W } = solve(rig, withPose(rig, CUP_POSE)); return posOf(rig, W, 'Hand', 't'); }
export function ghostPoints(rig) { const { W } = solve(rig, withPose(rig, GHOST_POSE)); return ['UpperArm', 'Forearm', 'Hand'].map(n => posOf(rig, W, n, 't')); }

const IK = (extra = {}) => ({ owner: 'Shin', target: 'IK_Foot', pole: null, poleAngle: 0, chain: 2, influence: 1, ...extra });
// A leg state with its own knee bend: the rig used to place things must have the same bend.
function leg(knee, ik) { const rig = makeRig('leg', { knee }), st = defaultState(rig); st.ik = ik; return { rig, st }; }
function liftedFoot(rig, st) { addWorldLocation(rig, st, solve(rig, st).W, 'IK_Foot', new Vector3(0, 0.6, 0.45)); return st; }
const kneeOut = info => info.kneeDir ? Math.atan2(info.kneeDir.x, info.kneeDir.z) * 180 / Math.PI : 0;
export const kneeForward = info => info.kneeDir ? info.kneeDir.z : -1;

// ─── Stage 3: a pole target that does not make the leg jump ─────────────────
// A leg modelled with its knee bent 30° outwards (crooked, as many character meshes are).
export const CROOKED = { angle: 30, bend: 0.07 };
CROOKED.knee = +(CROOKED.bend * Math.cos(CROOKED.angle * Math.PI / 180)).toFixed(4);
CROOKED.side = +(CROOKED.bend * Math.sin(CROOKED.angle * Math.PI / 180)).toFixed(4);
const legRig = st => makeRig('leg', { knee: st.knee || 0, kneeSide: st.kneeSide || 0, roll: st.roll || 0 });
// The rest pose with the IK on and off: the pole where it is, every other bone unposed.
function restPair(st) {
  const rig = legRig(st), a = cloneState(st);
  for (const [n, p] of Object.entries(a.pose)) if (n !== 'Knee_Pole') { p.rot = [0, 0, 0]; p.loc = [0, 0, 0]; }
  const on = { ...a, ik: { ...a.ik, influence: 1 } }, off = { ...a, ik: null };
  return { rig, on: solve(rig, on).W, off: solve(rig, off).W };
}
// How much the leg moves when the IK constraint turns on in the rest pose: knee jump (m) and twist of the Thigh (°).
export function restJump(st) {
  if (!st.ik) return { knee: 0, twist: 0 };
  const { rig, on, off } = restPair(st), i = rig.index.Thigh, j = rig.index.Shin;
  const xa = new Vector3(1, 0, 0).applyQuaternion(on[i].q), xb = new Vector3(1, 0, 0).applyQuaternion(off[i].q);
  return { knee: on[j].h.distanceTo(off[j].h), twist: Math.acos(Math.max(-1, Math.min(1, xa.dot(xb)))) * 180 / Math.PI };
}
// Angle between the pole (seen from the hip-to-ankle line) and the direction the knee is modelled in.
export function poleOffPlane(st) {
  const rig = legRig(st), { W } = solve(rig, { ...st, ik: null });
  const A = posOf(rig, W, 'Thigh'), C = posOf(rig, W, 'Shin', 't'), u = C.clone().sub(A).normalize();
  const perp = v => v.addScaledVector(u, -v.dot(u));
  const pole = perp(posOf(rig, W, 'Knee_Pole').sub(A)), bend = perp(restBend(rig, rig.index.Thigh, rig.index.Shin));
  if (pole.length() < 1e-6 || bend.length() < 1e-6) return 180;
  return pole.angleTo(bend) * 180 / Math.PI;
}
// The jump of the knee when a posed leg switches from IK (Influence 1) to its FK rotations (Influence 0).
export function switchPop(st) {
  if (!st.ik) return 0;
  const rig = legRig(st), on = solve(rig, { ...st, ik: { ...st.ik, influence: 1 } }).W, off = solve(rig, { ...st, ik: { ...st.ik, influence: 0 } }).W;
  const j = rig.index.Shin; return Math.max(on[j].h.distanceTo(off[j].h), on[j].t.distanceTo(off[j].t));
}
// Pose › Apply › Visual Transform: the bones keep the pose the constraint gives them (root first).
export function applyVisual(st, names) {
  for (const n of ['Hips', 'Thigh', 'Shin', 'Foot'].filter(x => names.includes(x))) {
    const rig = legRig(st), { W } = solve(rig, st), w = W[rig.index[n]];
    setWorldRotation(rig, st, W, n, w.q.clone());
  }
  return st;
}
// Where the pole should be: in front of the knee, along the direction the knee is modelled in.
export function planePole(st, dist = 1.5) {
  const rig = legRig(st), bend = restBend(rig, rig.index.Thigh, rig.index.Shin).normalize(), knee = rig.bones[rig.index.Shin].headV;
  return knee.clone().addScaledVector(bend, dist);
}
function crookedLeg(extra = {}) {
  const st = defaultState(makeRig('leg'));
  Object.assign(st, { knee: CROOKED.knee, kneeSide: CROOKED.side, roll: 0, ...extra });
  st.ik = IK({ pole: 'Knee_Pole', poleAngle: -90 });
  return st;
}
function movePoleTo(st, target) { const rig = legRig(st), { W } = solve(rig, st); addWorldLocation(rig, st, W, 'Knee_Pole', target.clone().sub(posOf(rig, W, 'Knee_Pole'))); return st; }

export const STAGES = [
  {
    id: 'fk', name: 'Forward kinematics', sub: 'Arm · FK', rig: 'arm',
    steps: [
      {
        id: 'f1', title: 'Parents move their children',
        text: 'An armature is a hierarchy: every bone follows its parent. Rotate the UpperArm and watch the Forearm and the Hand come along. Then rotate the Forearm: now only the Hand follows. In FK you pose a chain from the root to the tip, one rotation after another.',
        how: ['Click the <b>UpperArm</b> bone to select it (it turns blue).', 'Press <kbd>R</kbd> and move the mouse, or type <kbd>R</kbd> <kbd>X</kbd> <kbd>X</kbd> <kbd>4</kbd><kbd>5</kbd> <kbd>Enter</kbd> to turn 45° around its own X axis.', 'Select the <b>Forearm</b> and rotate it too (at least 30° each).'],
        why: 'Children inherit the movement of their parents, so a rotation near the root moves everything after it.',
        start: rig => defaultState(rig),
        check: (st, c) => rotAngle(st.pose.UpperArm.rot) >= 30 && rotAngle(st.pose.Forearm.rot) >= 30,
        solve: (st) => { st.pose.UpperArm.rot = [45, 0, 0]; st.pose.Forearm.rot = [45, 0, 0]; },
      },
      {
        id: 'f2', title: 'Copy the pose',
        text: 'Match the transparent ghost: a wave. Work from the root to the tip: first the UpperArm (up and forward), then the Forearm, then the Hand. The elbow, the wrist and the fingertips must end up inside the ghost.',
        how: ['Rotate the <b>UpperArm</b> first: <kbd>R</kbd> <kbd>X</kbd> <kbd>X</kbd> raises it, <kbd>R</kbd> <kbd>Z</kbd> <kbd>Z</kbd> swings it forward or back.', 'Then the <b>Forearm</b> and the <b>Hand</b>.', 'Orbit with <kbd>MMB</kbd> to check the depth. The rotations are also in the <b>Transform</b> panel: you can type them.'],
        why: 'FK gives you full control of every arc, which is why it is used for arms that swing freely.',
        ghost: true,
        start: rig => defaultState(rig),
        check: (st, c) => { const g = ghostPoints(c.rig); return ['UpperArm', 'Forearm', 'Hand'].every((n, k) => posOf(c.rig, c.W, n, 't').distanceTo(g[k]) < 0.25); },
        solve: (st, rig) => { for (const [n, r] of Object.entries(GHOST_POSE)) st.pose[n].rot = [...r]; },
      },
      {
        id: 'f3', title: 'Keep the hand on the cup',
        text: 'The fingertips are touching the cup. Now twist the Chest 25°: the whole arm turns with it and the hand leaves the cup, because FK keeps rotations, not positions. Bring the fingertips back to the cup by rotating only the arm bones.',
        how: ['Select the <b>Chest</b> and type <kbd>R</kbd> <kbd>Z</kbd> <kbd>2</kbd><kbd>5</kbd> <kbd>Enter</kbd>.', 'Rotate <b>UpperArm</b>, <b>Forearm</b> and <b>Hand</b> until the fingertips touch the cup again.', 'Notice how many rotations you need: this is the problem IK solves.'],
        why: 'When a hand or a foot must stay in place (a table, the floor) while the body moves, FK means re-posing the whole chain every time.',
        cup: true,
        start: rig => withPose(rig, CUP_POSE),
        check: (st, c) => rotAngle(st.pose.Chest.rot) >= 20 && posOf(c.rig, c.W, 'Hand', 't').distanceTo(cupPoint(c.rig)) < 0.15,
        solve: (st, rig) => { st.pose.Chest.rot = [0, 25, 0]; reachFK(rig, st, ['UpperArm', 'Forearm', 'Hand'], cupPoint(rig)); },
      },
    ],
  },
  {
    id: 'ik', name: 'Inverse kinematics', sub: 'Leg · IK + pole', rig: 'leg',
    steps: [
      {
        id: 'k1', title: 'Add the IK constraint',
        text: 'Move the IK_Foot control: only the foot goes, the leg stays behind. Add an Inverse Kinematics constraint to the Shin, with IK_Foot as its target, and set Chain Length to 2 so the chain is Shin + Thigh. Now the leg reaches for the control.',
        how: ['Select <b>IK_Foot</b> (the box under the foot), press <kbd>G</kbd> and move it.', 'Select the <b>Shin</b>. In <b>Bone Constraints</b>: <b>Add Bone Constraint › Inverse Kinematics</b>, <b>Bone: IK_Foot</b>. (Or click IK_Foot, <kbd>Shift</kbd>-click the Shin and press <kbd>Shift</kbd><kbd>I</kbd> › <b>To Active Bone</b>.)', 'Set <b>Chain Length</b> to 2. With 0 the chain goes up to the root and the Hips rotate too.'],
        why: 'With IK you place the end of the chain and the solver finds the rotations of the bones above it.',
        start: rig => defaultState(rig),
        check: (st, c) => !!st.ik && st.ik.owner === 'Shin' && st.ik.target === 'IK_Foot' && st.ik.chain === 2 && (st.ik.influence ?? 1) > 0.99,
        solve: (st) => { st.ik = IK(); },
      },
      {
        id: 'k2', title: 'A slight bend',
        text: 'The foot is lifted and the knee bends backwards. The leg was modelled perfectly straight, so the IK has no hint: forwards and backwards are equally good, and it picks the wrong one. Riggers avoid this by giving the knee a slight bend in Edit Mode, in the direction it must bend. Move the knee joint a few centimetres forward.',
        how: ['Press <kbd>Tab</kbd> to enter <b>Edit Mode</b>: the bones go back to their rest position.', 'Click the knee joint (the ball between Thigh and Shin) and type <kbd>G</kbd> <kbd>Y</kbd> <kbd>-</kbd><kbd>0</kbd><kbd>.</kbd><kbd>0</kbd><kbd>5</kbd> <kbd>Enter</kbd>: 5 cm forward (−Y is the front in Blender).', 'Press <kbd>Tab</kbd> again to go back to Pose Mode: the knee bends forward now.'],
        why: 'The IK solver bends the chain the way it is already bent in the rest pose. A small bend is enough; the pole target, in the next step, then decides exactly where the knee points.',
        start: () => { const { rig, st } = leg(0, IK()); return liftedFoot(rig, st); },
        check: (st, c) => (st.knee || 0) >= 0.02 && (st.knee || 0) <= 0.2 && kneeForward(c.info) > 0.9,
        solve: (st) => { st.knee = KNEE_BEND; },
      },
      {
        id: 'k3', title: 'Point the knee',
        text: 'The knee bends forward now, but nothing tells it exactly where to point: move the IK_Foot sideways and the knee swings with it. Add a Pole Target: the Knee_Pole in front of the knee. Then adjust the Pole Angle until the knee points at it.',
        how: ['Select the <b>Shin</b> and, in its IK constraint, set <b>Pole Target: Knee_Pole</b>.', 'The knee now points sideways. Change <b>Pole Angle</b> until the knee points forward (try -90°).', 'Move the <b>Knee_Pole</b> with <kbd>G</kbd>: the knee follows it.'],
        why: 'The pole target decides the direction of the joint, so knees and elbows never flip. The right Pole Angle depends on the roll of the bones: for a leg like this one it is usually -90°.',
        start: () => { const { rig, st } = leg(KNEE_BEND, IK()); return liftedFoot(rig, st); },
        check: (st, c) => !!st.ik && st.ik.pole === 'Knee_Pole' && kneeForward(c.info) > 0.95,
        solve: (st) => { st.ik.pole = 'Knee_Pole'; st.ik.poleAngle = -90; },
      },
      {
        id: 'k4', title: 'Crouch with the foot planted',
        text: 'Lower the Hips at least 0.4 m: the foot stays on the floor and the knee bends by itself. Then move the Knee_Pole outwards so the knee points 15°–50° to the outside, as in a relaxed crouch.',
        how: ['Select the <b>Hips</b> and type <kbd>G</kbd> <kbd>Z</kbd> <kbd>-</kbd><kbd>0</kbd><kbd>.</kbd><kbd>5</kbd> <kbd>Enter</kbd>.', 'Select the <b>Knee_Pole</b> and move it along X: <kbd>G</kbd> <kbd>X</kbd> <kbd>0</kbd><kbd>.</kbd><kbd>8</kbd> <kbd>Enter</kbd>.', 'The sidebar shows where the knee points.'],
        why: 'This is why legs are rigged with IK: the body moves and the feet stay where they are.',
        start: () => leg(KNEE_BEND, IK({ pole: 'Knee_Pole', poleAngle: -90 })).st,
        check: (st, c) => { const h = posOf(c.rig, c.W, 'Hips'); const o = kneeOut(c.info); return 2.3 - h.y >= 0.4 && c.info.dist < 0.02 && o >= 15 && o <= 50; },
        solve: (st) => { const rig = makeRig('leg', { knee: st.knee }); st.pose.Hips.loc = [0, -0.5, 0]; addWorldLocation(rig, st, solve(rig, st).W, 'Knee_Pole', new Vector3(0.8, 0, 0)); },
      },
      {
        id: 'k5', title: 'IK or FK: Influence',
        text: 'Every constraint has an Influence. Drag it down to 0: the leg goes back to its FK rotations (its rest pose, with the slight bend, because nobody rotated the bones). Bring it back to 1 and the IK takes over again. Rigs use this to switch a limb between FK and IK.',
        how: ['Select the <b>Shin</b>.', 'In the IK constraint, drag <b>Influence</b> down to 0.', 'Drag it back up to 1.'],
        why: 'Arms often need both: FK to swing freely, IK to lean on a table. An IK/FK switch is an Influence you can animate.',
        start: () => { const { st } = leg(KNEE_BEND, IK({ pole: 'Knee_Pole', poleAngle: -90 })); st.pose.Hips.loc = [0, -0.5, 0]; return st; },
        check: (st, c) => !!st.ik && !!c.flags.lowInfluence && (st.ik.influence ?? 1) > 0.99,
        solve: (st, rig, flags) => { flags.lowInfluence = true; st.ik.influence = 1; },
      },
    ],
  },
  {
    id: 'pole', name: 'Pole without jumps', sub: 'Crooked leg · roll · IK/FK', rig: 'leg',
    steps: [
      {
        id: 'p1', title: 'The pole in the plane of the leg',
        text: 'This leg was modelled like many characters: the knee is not straight ahead, it is bent 30° outwards. The pole is straight in front, so turning the IK on already moves the knee, before anyone animates: that is the jump. The hip, the knee and the ankle make a plane; the pole must be in that plane, in front of the knee. Move the Knee_Pole until the knee does not move.',
        how: ['Look at the <b>Readout</b>: <b>Knee jump when IK turns on</b> must go below 1 cm and <b>Pole off the leg plane</b> below 3°.', 'Select <b>Knee_Pole</b> and move it sideways with <kbd>G</kbd> <kbd>X</kbd>: the dashed line from the knee shows where the plane points.', 'In Blender: in Edit Mode, snap the 3D cursor to the knee joint and place the pole along the knee direction, not along the world axis.'],
        why: 'The IK always puts the knee in the plane that contains the pole. If that plane is not the one the leg was modelled in, the knee swings to it the moment the constraint is on.',
        lines: true,
        start: () => crookedLeg(),
        check: st => restJump(st).knee < 0.01 && poleOffPlane(st) < 3,
        solve: st => movePoleTo(st, planePole(st)),
      },
      {
        id: 'p2', title: 'Roll the bones with the knee',
        text: 'The pole is in the plane now and the knee stays put, but the Thigh still twists 30° around itself when the IK turns on: a mesh skinned to it would twist too. The IK uses the X axis of the bones: it wants X at a right angle to the plane of the leg. These bones still have roll 0, made for a knee that points straight ahead. Give the Thigh and the Shin the roll of this crooked knee.',
        how: ['Press <kbd>Tab</kbd> for <b>Edit Mode</b>. In the Edit Mode panel, change <b>Roll</b> (it rolls the Thigh and the Shin).', 'Watch <b>Leg twist when IK turns on</b> in the Readout: it must go below 3° (try −30°: the knee turns outwards, the X axis turns with it). Turn on <b>Axes</b> to see the X axes.', 'In Blender: Edit Mode › <b>Armature › Bone Roll › Recalculate Roll</b> (<kbd>Shift</kbd><kbd>N</kbd>) or type the Roll in the Bone properties; then check the Pole Angle again.'],
        why: 'Pole Angle −90° only works when the bone roll matches the knee. A wrong roll makes the leg twist, and fixing it with the Pole Angle moves the knee instead: fix the roll.',
        lines: true, roll: true,
        start: () => { const st = crookedLeg(); return movePoleTo(st, planePole(st)); },
        check: st => restJump(st).twist < 3 && restJump(st).knee < 0.01 && Math.abs((st.ik?.poleAngle ?? -90) + 90) < 0.5,
        solve: st => { st.roll = -30; movePoleTo(st, planePole(st)); },
      },
      {
        id: 'p3', title: 'IK to FK without a pop',
        text: 'The leg is crouched with IK. Its FK rotations are still the rest pose, so if you drag Influence to 0 the leg jumps back to straight: the pop animators hate. Before switching, copy the pose the IK gives the bones into their own rotations: Apply › Visual Transform. Then turn the IK off: nothing moves.',
        how: ['Select the <b>Thigh</b> and the <b>Shin</b> (<kbd>Shift</kbd> click).', 'Click <b>Apply › Visual Transform</b> in the Transform panel (<kbd>Ctrl</kbd><kbd>A</kbd> in Blender\'s Pose Mode).', 'Drag the IK <b>Influence</b> to 0: the <b>Pop when switching</b> readout stays below 2 cm.'],
        why: 'Real rigs have separate IK and FK chains and snap buttons (Rigify has them) that do exactly this before the switch is keyed. Snapping first is the rule for any IK/FK switch.',
        lines: false,
        start: () => { const st = defaultState(makeRig('leg')); st.knee = KNEE_BEND; st.ik = IK({ pole: 'Knee_Pole', poleAngle: -90 }); st.pose.Hips.loc = [0, -0.5, 0]; return st; },
        check: (st, c) => !!st.ik && (st.ik.influence ?? 1) <= 0.05 && switchPop(st) < 0.02 && !!c.flags.appliedVisual,
        solve: (st, rig, flags) => { applyVisual(st, ['Thigh', 'Shin']); st.ik.influence = 0; flags.appliedVisual = true; },
      },
    ],
  },
];
export { cloneState };
