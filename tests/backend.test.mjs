import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Budget, RESERVATION } from '../server/budget.mjs';
import { createService } from '../server/service.mjs';
const scene = {
  kind: 'scene',
  name: 'Cup',
  description: 'A little cup',
  code: 'api.part("cup",{});',
  actions: [{ id: 'spin', label: 'Spin' }]};
const request = {
  requestId: 'c5dbbf6a-106d-402d-9e9b-32dcc288f075',
  mode: 'generate',
  image: { data: 'abc', mediaType: 'image/jpeg' }};
function ledger(t, limit = 5) {
  const dir = mkdtempSync(join(tmpdir(), 'iw-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new Budget(join(dir, 'usage.json'), limit);
}
test('budget blocks overspend and survives restart including uncertain calls',t=> {
  const b = ledger(t, RESERVATION * 1.5);
  const e = b.reserve('a', 'generate');
  b.uncertain(e);
  const restarted = new Budget(b.path, b.limit);
  assert.throws(() => restarted.reserve('b', 'edit'), /budget/);
  assert.equal(restarted.summary().spent, RESERVATION);
});
test('all generation calls use fixed Sonnet low effort; duplicate id is cached', async t=> {
  const b = ledger(t);
  let calls = 0;
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'claude-sonnet-4-6');
      if (url.endsWith('count_tokens'))
        return { ok: true, json: async () => ({ input_tokens: 1200 }) };
      calls++;
      assert.equal(body.output_config.effort, 'low');
      assert.equal(body.max_tokens, 6000);
      return {
        ok: true,
        json: async () => ({
          stop_reason: 'end_turn',
          usage: { input_tokens: 1200, output_tokens: 500 },
          content: [{ type: 'text', text: JSON.stringify(scene) }]})};
    }});
  assert.equal((await run(request)).result.name, 'Cup');
  await run(request);
  assert.equal(calls, 1);
  assert.equal(b.summary().spent,.0111);
});
test('ambiguous network failure keeps the full cost reservation', async t=> {
  const b = ledger(t);
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async url=> {
      if (url.endsWith('count_tokens'))
        return { ok: true, json: async () => ({ input_tokens: 1 }) };
      throw new Error('Disconnected');
    }});
  await assert.rejects(run(request), /Disconnected/);
  assert.equal(b.summary().spent, RESERVATION);
  assert.equal(b.entries[0].status, 'uncertain');
});
test('overlarge context never sends a paid generation', async t=> {
  const b = ledger(t);
  let calls = 0;
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async () => {
      calls++;
      return { ok: true, json: async () => ({ input_tokens: 16001 }) };
    }});
  await assert.rejects(run(request), /too large/);
  assert.equal(calls, 1);
  assert.equal(b.summary().requests, 0);
});
test('invalid AI output is charged but cannot replace a scene', async t=> {
  const b = ledger(t);
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async url=> ({
      ok: true,
      json: async () =>
        url.endsWith('count_tokens')
          ? { input_tokens: 1 }
          : {
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [{ type: 'text', text: 'bad' }]}})});
  await assert.rejects(run(request), /invalid scene/);
  assert.ok(b.summary().spent > 0);
});
test('repair attempts remain bounded across backend restarts',t=> {
  const b = ledger(t);
  const e = b.reserve('repair-1', 'repair', 'scene-hash');
  b.settle(e, { input_tokens: 100, output_tokens: 100 }, 10);
  const restarted = new Budget(b.path, 5);
  assert.throws(() => restarted.reserve('repair-2', 'repair', 'scene-hash'), /one repair/);
});
test('simultaneous calls cannot spend twice', async t=> {
  const b = ledger(t);
  let release;
  const held = new Promise(resolve=> {
    release = resolve;
  });
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async url=> {
      if (url.endsWith('count_tokens'))
        return { ok: true, json: async () => ({ input_tokens: 100 }) };
      await held;
      return {
        ok: true,
        json: async () => ({
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 100 },
          content: [{ type: 'text', text: JSON.stringify(scene) }]})};
    }});
  const first = run(request);
  await assert.rejects(run({ ...request, requestId: 'second' }), /already being generated/);
  release();
  await first;
  assert.equal(b.entries.length, 1);
});
test('explicit authentication rejection costs zero and gives a useful error', async t=> {
  const b = ledger(t);
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async url=>
      url.endsWith('count_tokens')
        ? { ok: true, json: async () => ({ input_tokens: 100 }) }
        : { ok: false, status: 401 }});
  await assert.rejects(run(request), /key was rejected/);
  assert.equal(b.summary().spent, 0);
});
test('edits send current scene and prompt without resending the photo', async t=> {
  const b = ledger(t);
  const run = createService({
    key: 'fake',
    budget: b,
    transport: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].content.length, 1);
      assert.equal(body.messages[0].content[0].type, 'text');
      assert.ok(body.messages[0].content[0].text.includes('Make it purple'));
      return {
        ok: true,
        json: async () =>
          url.endsWith('count_tokens')
            ? { input_tokens: 100 }
            : {
                stop_reason: 'end_turn',
                usage: { input_tokens: 100, output_tokens: 100 },
                content: [{ type: 'text', text: JSON.stringify(scene) }]}};
    }});
  await run({ ...request, mode: 'edit', scene, prompt: 'Make it purple' });
});
test('budget ceiling cannot be configured above five dollars',t=> {
  assert.equal(ledger(t, 50).limit, 5);
});
