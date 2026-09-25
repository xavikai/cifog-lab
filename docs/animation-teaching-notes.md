# Animation Lab — teaching notes

The interface uses Blender's English names (Graph Editor, Timeline, Keyframe, Bezier, Vector, Maintain Volume…) so students find the same words in Blender. Explanations can be switched to Catalan or Spanish.

## How to use it in class

- Keep the **Motion Path** on: one dot per frame. Close dots = slow, far dots = fast. It is the quickest way to *see* spacing.
- Ask students to predict what a change will do before playing (Space): "If I make this handle longer, where will the dots bunch?"
- Link every curve shape to a motion: flat = stopped, steep = fast, sharp V = impact, rounded top = hang time.
- Each step is checked automatically. "Show a solution" loads one possible answer, and Ctrl Z brings the student's version back.

## Stage 1 · Timing

1. **Ease in and out** — Linear keys look robotic; T › Bezier eases the tops.
2. **Hit the ground hard** — Auto Clamped handles also flatten the contacts (the ball sticks to the floor); V › Vector makes a sharp V.
3. **Lose energy** — every bounce lower.
4. **Faster bounces** — every bounce shorter (the frame counts are drawn under the contacts). G then X moves keys only in time.

## Stage 2 · Squash & Stretch

The ball's origin is at its base, as animators usually set it for squash.

1. **Squash on contact** — Z Scale ≈ 0.6 at the first two contacts.
2. **Stretch in the air** — insert keys (I) two frames before and after the first contact, Z Scale ≈ 1.2.
3. **Round at the top** — Z Scale back to 1 at the tops.
4. **Keep the volume** — Maintain Volume: X Scale = 1/√(Z Scale), as Blender's Maintain Volume constraint.

## Stage 3 · Weight

Each step loads its own starting scene.

1. **A bowling ball** — first bounce ≤ 30% of the drop and ≤ 10 frames long.
2. **A beach ball** — hang time ≥ 55% (time above 80% of the bounce height), only by lengthening the handles at the top.
3. **Match a real bounce** — the dashed curve is a physics simulation (parabolas, restitution 0.6). Bezier + Vector gets about 89%; steeper contact handles reach 94% or more. A good moment to explain why a falling object follows a parabola.

## Differences from Blender

- One object, one side camera and four channels (X Location is locked: the ball travels at constant speed).
- A single handle type per key (Blender stores one per side).
- Handles are shown only for selected keys, as with Blender's "Only Selected Keyframes Handles".
- Automatic handles use one third of the distance to the neighbouring keys.
