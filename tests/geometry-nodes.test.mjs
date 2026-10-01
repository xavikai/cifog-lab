import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, makeNode, makeLink, addLink, canLink, evaluate } from '../labs/gn-shared/core.js';
import { LABS, solutionPasses } from '../labs/gn-shared/curriculum.js';

test('all sixteen worked examples produce the geometry and decisions their steps require', () => {
  const results = solutionPasses();
  assert.equal(results.length, 16);
  assert.deepEqual(results.filter(r => !r.ok || r.errors.length), []);
  for (const lab of Object.values(LABS)) assert.equal(lab.steps.length, 4);
});

test('the graph editor accepts typed wires and rejects incompatible sockets and cycles', () => {
  const graph = { nodes: [makeNode('input', 'GroupInput', 0, 0), makeNode('output', 'GroupOutput', 0, 0), makeNode('set', 'SetPosition', 0, 0), makeNode('index', 'Index', 0, 0)], links: [], exposed: [] };
  assert.equal(addLink(graph, makeLink('input', 'Geometry', 'set', 'Geometry')), true);
  assert.equal(addLink(graph, makeLink('set', 'Geometry', 'output', 'Geometry')), true);
  assert.equal(canLink(graph, makeLink('set', 'Geometry', 'set', 'Geometry')), false);
  assert.equal(canLink(graph, makeLink('index', 'Index', 'output', 'Geometry')), false);
  assert.equal(canLink(graph, makeLink('index', 'Index', 'set', 'Selection')), true);
  assert.equal(NODES.SetPosition.inputs.find(s => s.key === 'Offset').field, true);
});

test('fields vary per vertex and an exposed modifier value changes the terrain', () => {
  const graph = LABS[2].steps[3].solution();
  const low = evaluate(graph, { lab: 2 });
  assert.ok(low.stats.vertices >= 300);
  assert.ok(low.stats.maxZ - low.stats.minZ > .4);
  const e = graph.exposed.find(x => x.targetSocket === 'Value_001');
  assert.ok(e);
  e.value = 1.7;
  const high = evaluate(graph, { lab: 2 });
  assert.ok(high.stats.maxZ - high.stats.minZ > (low.stats.maxZ - low.stats.minZ) * 1.8);
  assert.notEqual(high.spreadsheet[0].position[2], high.spreadsheet[1].position[2]);
});

test('scatter uses the previous terrain, is deterministic, and Realize converts instances', () => {
  const terrain = evaluate(LABS[2].steps[3].solution(), { lab: 2 }).geometry;
  const graph = LABS[3].steps[2].solution();
  const a = evaluate(graph, { lab: 3, inputGeometry: terrain });
  const b = evaluate(graph, { lab: 3, inputGeometry: terrain });
  assert.deepEqual(a.geometry.points, b.geometry.points);
  assert.ok(a.stats.instances > 5);
  graph.nodes.push(makeNode('realize', 'RealizeInstances', 1180, 0));
  graph.links = graph.links.filter(l => l.to !== 'output');
  graph.links.push(makeLink('instances', 'Instances', 'realize', 'Geometry'), makeLink('realize', 'Geometry', 'output', 'Geometry'));
  const realized = evaluate(graph, { lab: 3, inputGeometry: terrain });
  assert.equal(realized.stats.meshes, a.stats.meshes);
  assert.equal(realized.stats.instances, 0);
});

test('curve project joins a swept rail with evenly spaced post instances', () => {
  const result = evaluate(LABS[4].steps[3].solution(), { lab: 4 });
  assert.equal(result.stats.tubes, 1);
  assert.equal(result.stats.instances, 9);
  assert.equal(result.stats.points, 9);
  assert.equal(result.geometry.meshes.filter(m => m.kind === 'cube').length, 9);
});
