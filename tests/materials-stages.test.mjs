import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,startState,hsv} from '../labs/materials/stages.js';
import {INPUTS} from '../labs/materials/graph.js';
const steps=STAGES.flatMap(s=>s.steps);
test('every step starts unsolved and its solution solves it',()=>{
 for(const step of steps){
  const s=startState(step);
  assert.equal(step.check(s),false,`${step.id} starts solved`);
  step.solve(s);assert.equal(step.check(s),true,`${step.id} solution fails`);
 }
});
test('start links are valid connections between visible nodes',()=>{
 for(const step of steps){
  const s=startState(step);
  for(const [to,from] of Object.entries(s.links)){
   assert.ok(INPUTS[to]?.includes(from),`${step.id}: ${from} -> ${to}`);
   for(const n of [to,from].map(k=>k.split(':')[0])) assert.ok(s.nodes.includes(n),`${step.id}: ${n} hidden`);
  }
 }
});
test('step ids are unique and every stage has steps',()=>{
 assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
 for(const st of STAGES)assert.ok(st.steps.length>=3);
});
test('hsv reads gold as warm yellow',()=>{const c=hsv('#ffe29b');assert.ok(c.h>35&&c.h<50&&c.v===1);});
test('start states are independent copies',()=>{
 const a=startState(steps[0]);a.values.roughness=0;a.links.x=1;
 const b=startState(steps[0]);assert.notEqual(b.values.roughness,0);assert.equal(b.links.x,undefined);
});
