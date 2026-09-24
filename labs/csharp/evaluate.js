import { compile, Runner, CSharpError } from './interpreter.js';
import { World, compare, random } from './world.js';
import { checkRequirements } from './levels.js';

export function prepare(challenge, seed = 1) {
  const s = challenge.setup(random(seed));
  return { world: new World({ start: s.start || [0, 0], columns: s.columns || {}, ground: s.ground || {} }), target: s.target || {} };
}

// Runs a program without animation. Used for tests and for checking randomized challenges.
export function runHeadless(challenge, code, seed = 1) {
  const compiled = compile(code);
  if (!compiled.ok) return { compiled, ok: false };
  const { world, target } = prepare(challenge, seed);
  const runner = new Runner(compiled.ast, world);
  let error = null;
  try { runner.runToEnd(); }
  catch (e) { if (e instanceof CSharpError) error = e; else throw e; }
  const result = compare(world, target);
  const requirements = checkRequirements(challenge, compiled.stats);
  return { compiled, runner, world, target, error, result, requirements, ok: !error && result.ok && requirements.every(r => r.ok) };
}

export function verifySeeds(challenge, code, seeds) {
  return seeds.map(seed => {
    const r = runHeadless(challenge, code, seed);
    return { seed, ok: !r.error && r.result?.ok };
  });
}
