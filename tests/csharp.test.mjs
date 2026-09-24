import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, Runner, formatValue } from '../labs/csharp/interpreter.js';
import { World } from '../labs/csharp/world.js';
import { CHALLENGES, assembleParsons } from '../labs/csharp/levels.js';
import { runHeadless, verifySeeds } from '../labs/csharp/evaluate.js';

function run(code, world = new World()) {
  const c = compile(code);
  assert.equal(c.ok, true, c.errors.map(e => `${e.line}: ${e.code} ${e.message}`).join('\n'));
  const r = new Runner(c.ast, world);
  r.runToEnd();
  return r;
}
const out = code => run(code).output.map(o => o.text);
const errors = code => compile(code).errors.map(e => e.code);

test('every challenge solution passes, including extra random seeds', () => {
  for (const ch of CHALLENGES.filter(c => !c.sandbox)) {
    const r = runHeadless(ch, ch.solution, 7, ch.question?.answer);
    assert.equal(r.ok, true, `${ch.id}: ${r.error?.message || r.compiled.errors.map(e => e.message).join(', ') || JSON.stringify({ shape: r.shape, output: r.output, req: r.requirements })}`);
    if (ch.randomized) assert.ok(verifySeeds(ch, ch.solution, [11, 23, 42]).every(s => s.ok), ch.id);
  }
});

test('predict questions: the declared answer is what really happens, and it is one of the options', () => {
  for (const ch of CHALLENGES.filter(c => c.type === 'predict')) {
    const r = runHeadless(ch, ch.starter, 1, ch.question.answer);
    assert.equal(r.prediction.actual, ch.question.answer, ch.id);
    assert.ok(ch.question.options.includes(ch.question.answer), ch.id);
    assert.equal(r.prediction.ok, true, ch.id);
    const wrong = ch.question.options.find(o => o !== ch.question.answer);
    assert.equal(runHeadless(ch, ch.starter, 1, wrong).prediction.ok, false, ch.id);
  }
});

test('starters: create/fix/complete need work, observe/predict run as given', () => {
  for (const ch of CHALLENGES) {
    if (ch.type === 'parsons') { assert.equal(ch.starter, ''); continue; }
    const c = compile(ch.starter);
    if (ch.type === 'observe' || ch.type === 'predict') { assert.equal(runHeadless(ch, ch.starter).error, null, ch.id); continue; }
    if (ch.type === 'complete') { assert.ok(c.errors.some(e => e.message === 'Fill in the blank ___'), ch.id); continue; }
    if (['1-3', '2-3', '0-7'].includes(ch.id)) { assert.equal(c.ok, false, ch.id); continue; }
    assert.equal(c.ok, true, `${ch.id}: ${c.errors.map(e => e.message)}`);
    if (!ch.sandbox) assert.equal(runHeadless(ch, ch.starter, 3).ok, false, ch.id);
  }
});

test('parsons: distractors break the program and the lines alone solve it', () => {
  for (const ch of CHALLENGES.filter(c => c.type === 'parsons')) {
    const reversed = assembleParsons([...ch.parsons.lines].reverse());
    assert.equal(runHeadless(ch, reversed).ok, false, ch.id);
    const withDistractor = assembleParsons([...ch.parsons.lines.slice(0, -1), ch.parsons.distractors[0], ch.parsons.lines.at(-1)]);
    assert.equal(runHeadless(ch, withDistractor).ok, false, ch.id);
  }
});

test('the broken calculator shows the classic string + number trap', () => {
  assert.deepEqual(out('Console.WriteLine("2 + 3 = " + 2 + 3);'), ['2 + 3 = 23']);
});

test('drone.Build builds a tower and steps right, staying on the grid', () => {
  const w = new World();
  run('for (int i = 0; i < 10; i++) { drone.Build(1); }', w);
  assert.equal(w.columns.size, 8);
  assert.equal(w.column(7, 0).length, 3);
  assert.throws(() => run('drone.Build(9);'), /doesn't fit/);
  assert.throws(() => run('drone.Build(2 - 5);'), /negative/);
});

test('the sandbox pyramid runs without errors', () => {
  const ch = CHALLENGES.find(c => c.sandbox);
  const r = runHeadless(ch, ch.starter);
  assert.equal(r.error, null);
  assert.ok(r.world.blockCount() > 40);
});

test('integer division truncates, double division does not', () => {
  assert.deepEqual(out('int a = 7; Console.WriteLine(a / 2); double b = 7; Console.WriteLine(b / 2); Console.WriteLine(-7 / 2); Console.WriteLine(7 % 3);'), ['3', '3.5', '-3', '1']);
});

test('values print like C#', () => {
  assert.deepEqual(out('bool ok = 3 > 2; Console.WriteLine(ok); Console.WriteLine("n = " + 5 + 1); Console.WriteLine(0.1 + 0.2); float f = 1.1f; Console.WriteLine(f); Console.WriteLine(Color.Red); Console.WriteLine($"x={1 + 1}");'),
    ['True', 'n = 51', '0.30000000000000004', '1.1', 'Red', 'x=2']);
  assert.equal(formatValue(2, 'double'), '2');
});

test('the compiler reports type errors before anything runs', () => {
  assert.deepEqual(errors('int x = 2.5;'), ['CS0266']);
  assert.deepEqual(errors('float f = 2.5;'), ['CS0664']);
  assert.deepEqual(errors('int x = "3";'), ['CS0029']);
  assert.deepEqual(errors('Color c = "Red";'), ['CS0029']);
  assert.deepEqual(errors('int x = 1; if (x) { }'), ['CS0029']);
  assert.deepEqual(errors('bool b = 1 == "1";'), ['CS0019']);
  assert.deepEqual(errors('drone.Move(3);'), ['CS1503']);
  assert.deepEqual(errors('drone.MoveTo(1);'), ['CS1501']);
});

test('names, case sensitivity and scopes are checked', () => {
  assert.deepEqual(errors('drone.place(Color.Red);'), ['CS1061']);
  assert.deepEqual(errors('drone.Place(Color.red);'), ['CS0117']);
  assert.deepEqual(errors('y = 3;'), ['CS0103']);
  assert.deepEqual(errors('int a = 1; int a = 2;'), ['CS0128']);
  assert.deepEqual(errors('for (int i = 0; i < 3; i++) { } Console.WriteLine(i);'), ['CS0103']);
  assert.deepEqual(errors('int a; Console.WriteLine(a);'), ['CS0165']);
  assert.deepEqual(errors('int a; if (true) { a = 1; } else { a = 2; } Console.WriteLine(a);'), []);
  assert.deepEqual(errors('int a; if (true) { a = 1; } Console.WriteLine(a);'), ['CS0165']);
  assert.deepEqual(errors('break;'), ['CS0139']);
  assert.deepEqual(errors('drone.X = 3;'), ['CS0200']);
  assert.deepEqual(errors('Int n = 1;'), ['CS0246']);
});

test('syntax errors point to the right line', () => {
  const c = compile('drone.Move(Direction.Right)\ndrone.Place(Color.Red);');
  assert.equal(c.errors[0].code, 'CS1002');
  assert.equal(c.errors[0].line, 1);
  assert.equal(compile('for (int i = 0; i < 3; i++)\n{\n drone.Place();\n').errors[0].code, 'CS1513');
  assert.equal(compile('int x = 1;\nif (x = 2) { }').errors[0].line, 2);
  assert.equal(compile('Console.WriteLine("hi);').errors[0].code, 'CS1010');
});

test('loops, break and continue', () => {
  assert.deepEqual(out('for (int i = 0; i < 10; i++) { if (i == 4) break; if (i % 2 == 1) continue; Console.WriteLine(i); }'), ['0', '2']);
  assert.deepEqual(out('int n = 3; while (n > 0) { n--; } Console.WriteLine(n); int k = 0; do { k += 5; } while (k < 12); Console.WriteLine(k);'), ['0', '15']);
});

test('the step runner exposes conditions, line counts and scopes', () => {
  const c = compile('for (int i = 0; i < 2; i++)\n{\n    drone.Place(Color.Red);\n}');
  const r = new Runner(c.ast, new World());
  const events = [...r.run()];
  const conds = events.filter(e => e.kind === 'cond');
  assert.deepEqual(conds.map(e => e.value), [true, true, false]);
  assert.equal(conds[0].text, 'i < 2  →  0 < 2  →  true');
  assert.equal(r.lineCounts.get(3), 2);
  assert.equal(r.world.height(), 2);
});

test('runtime errors: leaving the grid, dividing by zero and endless loops', () => {
  const grid = compile('for (int i = 0; i < 9; i++) { drone.Move(Direction.Right); }');
  assert.throws(() => new Runner(grid.ast, new World()).runToEnd(), e => e.exception === 'DroneException' && e.line === 1);
  const div = compile('int z = 0;\nint y = 5 / z;');
  assert.throws(() => new Runner(div.ast, new World()).runToEnd(), e => e.exception === 'DivideByZeroException' && e.line === 2);
  const loop = compile('int i = 0;\nwhile (i < 5) { drone.Move(Direction.Right); drone.Move(Direction.Left); }');
  assert.throws(() => new Runner(loop.ast, new World(), { maxSteps: 500 }).runToEnd(), e => e.exception === 'TimeoutException');
});

test('a hard-coded answer fails the randomized challenge on other floors', () => {
  const ch = CHALLENGES.find(c => c.id === '3-5');
  const hard = runHeadless(ch, ch.solution, 5);
  assert.equal(hard.ok, true);
  const cols = [...hard.world.columns.entries()].map(([k, v]) => [k, v.length - v.filter(c => c === 'White').length]);
  const hardcoded = cols.map(([k, n]) => `drone.MoveTo(${k.split(',')[0]}, 0);` + ' drone.Place(Color.Blue);'.repeat(n)).join('\n');
  assert.equal(runHeadless(ch, hardcoded, 5).result.ok, true);
  assert.ok(verifySeeds(ch, hardcoded, [11, 23, 42]).some(s => !s.ok));
});
