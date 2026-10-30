import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScene } from '../viewer/sandbox.mjs';
import { sceneSchema } from '../shared/contract.mjs';
test('procedural loops create distinct parts through the bounded toolkit', () => {
  const calls = [];
  executeScene('for(var i=0;i<4;i++){api.part("leg"+i,{shape:"box",position:[i,0,0]});}', {
    part: (...v) => calls.push(v)});
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3], ['leg3', { shape: 'box', position: [3, 0, 0] }]);
});
test('host capabilities are absent, including constructor escape', () => {
  for (const source of [
    'window.fetch("x")',
    'process.exit()',
    'fetch("x")',
    'api.part.constructor("return process")()',
    'this.constructor.constructor("return window")()'])
    assert.throws(() => executeScene(source, { part() {} }));
});
test('infinite loops and operation floods terminate', () => {
  assert.throws(() => executeScene('while(true){}', {}), /limit/);
  assert.throws(
    () => executeScene('for(var i=0;i<200;i++)api.part("p"+i,{});', { part() {} }),
    /operations/);
});
test('scene metadata rejects duplicate actions and excessive source', () => {
  const scene = {
    kind: 'scene',
    name: 'Lamp',
    description: 'A lamp',
    code: 'x',
    actions: [{ id: 'light', label: 'Light' }]};
  assert.equal(sceneSchema.safeParse(scene).success, true);
 assert.equal(sceneSchema.safeParse({ ...scene,actions:[...scene.actions,...scene.actions]}).success,false);
 assert.equal(sceneSchema.safeParse({...scene,code: 'x'.repeat(24001) }).success, false);
});
