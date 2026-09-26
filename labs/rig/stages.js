// Stages of the Rig Lab. Every step loads its own starting pose, so students can jump between steps.
import { Vector3 } from '../../vendor/three.module.js';
import { makeRig, defaultState, cloneState, solve, posOf, rotAngle, reachFK, addWorldLocation } from './rig.js';

// The rig of a stage, with the knee bend (Edit Mode) of the state, if there is one.
export const rigFor = (stage, st) => makeRig(stage.rig, { knee: st?.knee || 0 });
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
];
export { cloneState };
