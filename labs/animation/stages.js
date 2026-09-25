// Stages, starting scenes, guided steps and their checks for the Animation Lab.
import { key, recalcHandles, evaluate, contacts, tops, strictlyDecreasing, intervals, sharpContact, hangTime, physicsBounce, matchScore, cloneKeys } from './fcurve.js';

export const FPS = 24;
export const RANGE = [1, 72];
export const CHANNELS = {
  locX: { name: 'X Location', color: '#ff6464', axis: 'X', locked: true },
  locZ: { name: 'Z Location', color: '#4aa3ff', axis: 'Z' },
  sclX: { name: 'X Scale', color: '#ff9a8a', axis: 'X' },
  sclZ: { name: 'Z Scale', color: '#8fd0ff', axis: 'Z' },
};

const V = 'VECTOR', AC = 'AUTO_CLAMPED';
// [frame, value, handle?] → keys
function curve(points, interp = 'BEZIER') {
  return recalcHandles(points.map(([f, v, h]) => key(f, v, interp, h || (v <= 0.05 ? V : AC))));
}
const travel = () => curve([[1, 0], [72, 9]], 'LINEAR');
const RUBBER = [[1, 4], [13, 0], [21, 2.6], [29, 0], [35, 1.7], [41, 0], [45, 1.0], [49, 0], [52, 0.5], [55, 0]];
export const REFERENCE = physicsBounce({ start: 1, height: 4, fall: 12, e: 0.6, end: 72 });
const PHYSICS_KEYS = [[1, 4], [13, 0], [20, 1.44], [27, 0], [32, 0.52], [36, 0], [39, 0.19], [41, 0]];

const locZ = d => d.channels.locZ;
const allBezier = keys => keys.slice(0, -1).every(k => k.interp === 'BEZIER');
const contactKeys = keys => keys.filter(k => k.value <= 0.05);
const allSharp = keys => contactKeys(keys).every(k => sharpContact(keys, k));
const topValues = keys => tops(keys).map(k => k.value);
export function firstBounce(keys) {
  const c = contacts(keys);
  return c.length >= 2 ? [c[0], c[1]] : null;
}
export function scaleZ(d, f) {
  const k = d.channels.sclZ;
  return k && k.length ? evaluate(k, f) : 1;
}
export function scaleX(d, f) {
  if (d.maintainVolume) return 1 / Math.sqrt(Math.max(0.05, scaleZ(d, f)));
  const k = d.channels.sclX;
  return k && k.length ? evaluate(k, f) : 1;
}
const maxOver = (fn, a, b) => { let m = -Infinity; for (let f = a; f <= b; f += 0.5) m = Math.max(m, fn(f)); return m; };

export const STAGES = [
  {
    id: 'timing', name: 'Timing', sub: 'Spacing and rhythm',
    channels: ['locX', 'locZ'],
    start: () => ({ channels: { locX: travel(), locZ: curve([[1, 4, AC], [13, 0, AC], [25, 4, AC], [37, 0, AC], [49, 4, AC], [61, 0, AC]], 'LINEAR') }, maintainVolume: false }),
    steps: [
      {
        id: 't1', title: 'Ease in and out',
        text: 'The keys use Linear interpolation: the ball moves at the same speed all the time, like a robot. Look at the Motion Path: the dots are evenly spaced. A real ball slows down at the top of each bounce.',
        how: ['Hover over the Graph Editor and press <kbd>A</kbd> to select all the keyframes.', 'Press <kbd>T</kbd> › <b>Bezier</b>.', 'Play with <kbd>Space</kbd> and look at the dots: close together at the top (slow), far apart near the ground (fast).'],
        why: 'Timing is how many frames an action takes; spacing is how far the object moves between frames. Close dots = slow, far dots = fast.',
        check: d => allBezier(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; }); },
      },
      {
        id: 't2', title: 'Hit the ground hard',
        text: 'With Bezier, Blender gives every key Auto Clamped handles, so the curve is flat at the contacts too: the ball slows down before it touches the floor and seems to stick to it. A ball hits the ground at full speed: the curve must make a sharp V, not a U.',
        how: ['Click a contact key (value 0), <kbd>Shift</kbd>-click the others.', 'Press <kbd>V</kbd> › <b>Vector</b>.', 'Play again: the ball now bounces off the floor.'],
        why: 'In the Graph Editor the slope of the curve is the speed. Flat = stopped; steep = fast.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; if (k.value <= 0.05) k.handle = V; }); recalcHandles(locZ(d)); },
      },
      {
        id: 't3', title: 'Lose energy',
        text: 'The ball bounces back to the same height every time, as if it never lost energy. Each bounce must be lower than the one before.',
        how: ['Click the key at the top of the second bounce and drag it down (or type its Value in the sidebar, <kbd>N</kbd> panel).', 'Make the third top lower still.', 'Check the heights in the sidebar: they must go down every bounce.'],
        why: 'A real ball loses part of its energy in every contact, so every bounce is lower.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))),
        solve: d => { const t = tops(locZ(d)); t.forEach((k, i) => { k.value = +(4 * Math.pow(0.55, i)).toFixed(2); }); recalcHandles(locZ(d)); },
      },
      {
        id: 't4', title: 'Faster bounces',
        text: 'Lower bounces are also shorter in time. Right now every bounce lasts 24 frames. Move the keys so each bounce takes fewer frames than the one before (the frame counts appear under the contacts).',
        how: ['Select the keys of the second and third bounce and drag them to the left (frames snap to whole numbers). <kbd>G</kbd> then <kbd>X</kbd> moves them only in time.', 'Keep each top in the middle of its bounce.', 'Aim for something like 16, then 12 frames.'],
        why: 'Timing gives weight and energy: long bounces feel slow and floaty, short bounces feel quick.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))) && strictlyDecreasing(intervals(contacts(locZ(d)))) && intervals(contacts(locZ(d))).length >= 2,
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [21, 2.2], [29, 0], [35, 1.2], [41, 0], [44, 0.5], [47, 0]]); },
      },
    ],
  },
  {
    id: 'squash', name: 'Squash & Stretch', sub: 'Flexible, not rigid',
    channels: ['locX', 'locZ', 'sclX', 'sclZ'],
    start: () => ({
      channels: {
        locX: travel(),
        locZ: curve([[1, 4], [13, 0], [21, 2.2], [29, 0], [35, 1.1], [40, 0], [44, 0.45], [47, 0]]),
        sclX: curve([[1, 1]]),
        sclZ: curve([1, 13, 21, 29, 35, 40, 44, 47].map(f => [f, 1, AC])),
      },
      maintainVolume: false,
    }),
    steps: [
      {
        id: 's1', title: 'Squash on contact',
        text: 'A rubber ball squashes when it hits the ground. Lower the Z Scale at the first two contacts (frames 13 and 29) to about 0.6. The ball\'s origin is at its base, so it squashes against the floor.',
        how: ['Click <b>Z Scale</b> in the channel list and hide <b>Z Location</b> with its eye, then press <kbd>Home</kbd> to frame the curve.', 'Click the Z Scale key at frame 13 and set its Value to 0.6 in the sidebar (or drag it down).', 'Do the same at frame 29.'],
        why: 'Squash and stretch shows that an object is soft and makes impacts readable.',
        check: d => { const c = contacts(locZ(d)); return c.length >= 2 && c.slice(0, 2).every(f => scaleZ(d, f) <= 0.8); },
        solve: d => { const k = d.channels.sclZ; for (const f of contacts(locZ(d)).slice(0, 2)) { const x = k.find(q => q.frame === f); if (x) x.value = 0.6; } recalcHandles(k); },
      },
      {
        id: 's2', title: 'Stretch in the air',
        text: 'Just before and just after the contact the ball moves fast, so it stretches along its movement. Add keys two frames before and two frames after the first contact with a Z Scale of about 1.2.',
        how: ['Go to frame 11 (arrow keys, or click the timeline).', 'With <b>Z Scale</b> active, press <kbd>I</kbd> to insert a keyframe, then set its Value to 1.2.', 'Repeat at frame 15.'],
        why: 'Stretch is a kind of motion blur drawn into the shape: it makes fast movement easier to follow.',
        check: d => { const c = contacts(locZ(d))[0]; return c != null && maxOver(f => scaleZ(d, f), c - 3, c - 1) >= 1.15 && maxOver(f => scaleZ(d, f), c + 1, c + 3) >= 1.1; },
        solve: d => { const k = d.channels.sclZ, c = contacts(locZ(d))[0]; for (const [f, v] of [[c - 2, 1.2], [c + 2, 1.15]]) { const x = k.find(q => q.frame === f); if (x) x.value = v; else k.push(key(f, v)); } recalcHandles(k); },
      },
      {
        id: 's3', title: 'Round at the top',
        text: 'At the top of each bounce the ball is almost still, so it must be perfectly round again (Z Scale 1). Check the first two tops (frames 1 and 21) after adding your squash and stretch keys.',
        how: ['Scrub to frame 21 and read the Z Scale in the sidebar.', 'If it is not close to 1, select the Z Scale key there and set it to 1.'],
        why: 'Keeping the shape stable when the ball is slow makes the squash at the contact stand out.',
        check: d => { const t = tops(locZ(d)).slice(0, 2); return STAGES[1].steps[0].check(d) && STAGES[1].steps[1].check(d) && t.length === 2 && t.every(k => Math.abs(scaleZ(d, k.frame) - 1) <= 0.07); },
        solve: d => { STAGES[1].steps[0].solve(d); STAGES[1].steps[1].solve(d); },
      },
      {
        id: 's4', title: 'Keep the volume',
        text: 'When the ball squashes it should get wider, and when it stretches, thinner: its volume stays the same. Right now it only gets shorter. Turn on Maintain Volume: X Scale is then calculated from Z Scale.',
        how: ['In the viewport header, turn on <b>Maintain Volume</b>.', 'Look at the X Scale curve: it now mirrors Z Scale.', 'In Blender: Object Constraints › <b>Maintain Volume</b>, or key X and Y scale by hand.'],
        why: 'If the volume changes, the ball seems to grow and shrink instead of squashing.',
        check: d => d.maintainVolume && STAGES[1].steps[0].check(d),
        solve: d => { STAGES[1].steps[2].solve(d); d.maintainVolume = true; },
      },
    ],
  },
  {
    id: 'weight', name: 'Weight', sub: 'Heavy or light',
    channels: ['locX', 'locZ'],
    independent: true, // each step loads its own starting scene
    steps: [
      {
        id: 'w1', title: 'A bowling ball',
        text: 'This is a rubber ball. Turn it into a heavy bowling ball: it barely bounces. Make the first bounce at most 30% as high as the drop (4 m → 1.2 m or less), and make it short: 10 frames or fewer between the first two contacts.',
        how: ['Drag the second top down to 1 m or less.', 'Move that bounce\'s keys to the left so it lasts 10 frames or fewer (<kbd>G</kbd> <kbd>X</kbd>).', 'Lower or delete (<kbd>X</kbd>) the later bounces.'],
        why: 'Heavy objects lose their energy quickly: low, short bounces and a sudden stop.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) }, maintainVolume: false }),
        check: d => { const t = topValues(locZ(d)), fb = firstBounce(locZ(d)); return t.length >= 2 && t[1] <= 0.3 * t[0] && fb && fb[1] - fb[0] <= 10 && allSharp(locZ(d)); },
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [18, 0.9], [23, 0], [25.5 | 0, 0.25], [28, 0]]); },
      },
      {
        id: 'w2', title: 'A beach ball',
        text: 'Now a light beach ball: it floats at the top of every bounce. Change only the handles: make the curve stay near the top for longer. Your goal is a hang time of 55% or more in the first bounce (time above 80% of its height).',
        how: ['Click the key at the top of the first bounce (frame 21). Its handles appear.', 'Drag each handle horizontally away from the key. They become Aligned, so the curve stays smooth.', 'Watch the hang time in the sidebar, and the dots of the Motion Path bunching at the top.'],
        why: 'Long handles at the top = the ball spends more frames up there = it feels light. This is how you give weight with curves alone.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) }, maintainVolume: false }),
        check: d => { const fb = firstBounce(locZ(d)); return fb && hangTime(locZ(d), fb[0], fb[1]) >= 0.55 && allSharp(locZ(d)); },
        solve: d => { const k = locZ(d); for (const t of tops(k)) { const i = k.indexOf(t), p = k[i - 1], n = k[i + 1]; t.handle = 'ALIGNED'; if (p) t.left = { frame: t.frame - (t.frame - p.frame) * 0.85, value: t.value }; if (n) t.right = { frame: t.frame + (n.frame - t.frame) * 0.85, value: t.value }; } },
      },
      {
        id: 'w3', title: 'Match a real bounce',
        text: 'The dashed yellow curve is a real ball simulated with physics. The keys are already at the right frames and heights, but with Linear interpolation. Shape the curve until it matches the reference: 94% or more.',
        how: ['Select all (<kbd>A</kbd>), <kbd>T</kbd> › <b>Bezier</b>, then the contacts <kbd>V</kbd> › <b>Vector</b>.', 'The contacts are still too soft: select a contact and drag its handles up so the curve leaves the ground more steeply.', 'Watch the match score in the sidebar.'],
        why: 'A falling object follows a parabola: slow at the top, fastest at the contact. Animators copy that shape with the handles.',
        reference: true,
        start: () => ({ channels: { locX: travel(), locZ: curve(PHYSICS_KEYS, 'LINEAR') }, maintainVolume: false }),
        check: d => matchScore(locZ(d), REFERENCE, 1, 60) >= 94,
        solve: d => {
          const k = locZ(d); k.forEach(q => { q.interp = 'BEZIER'; }); recalcHandles(k);
          for (const c of k) if (c.value <= 0.05) {
            const i = k.indexOf(c), p = k[i - 1], n = k[i + 1];
            c.handle = 'FREE';
            if (p) c.left = { frame: c.frame - (c.frame - p.frame) / 3, value: 2 * p.value / 3 };
            if (n) c.right = { frame: c.frame + (n.frame - c.frame) / 3, value: 2 * n.value / 3 };
          }
        },
      },
    ],
  },
];

export function startData(stage, stepIndex = 0) {
  const d = stage.independent ? stage.steps[stepIndex].start() : stage.start();
  return d;
}
export function cloneData(d) {
  return { channels: Object.fromEntries(Object.entries(d.channels).map(([k, v]) => [k, cloneKeys(v)])), maintainVolume: d.maintainVolume };
}
