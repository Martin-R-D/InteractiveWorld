import test from "node:test";
import assert from "node:assert/strict";
import { createService } from "../server/service.mjs";
const scene = {
  kind: "scene",
  name: "Cup",
  description: "A little cup",
  code: 'api.part("cup",{});',
  actions: [{ id: "spin", label: "Spin" }],
};
const request = {
  requestId: "c5dbbf6a-106d-402d-9e9b-32dcc288f075",
  mode: "generate",
  image: { data: "abc", mediaType: "image/jpeg" },
};
test("all generation calls use fixed configured Sonnet effort; duplicate id is cached", async (t) => {
  let calls = 0;
  const run = createService({
    key: "fake",
    transport: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, "claude-sonnet-4-6");
      if (url.endsWith("count_tokens"))
        return { ok: true, json: async () => ({ input_tokens: 1200 }) };
      calls++;
      assert.equal(body.output_config.effort, "medium");
      assert.equal(body.max_tokens, 32000);
      assert.equal(body.thinking, undefined);
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          usage: { input_tokens: 1200, output_tokens: 500 },
          content: [{ type: "text", text: JSON.stringify(scene) }],
        }),
      };
    },
  });
  assert.equal((await run(request)).result.name, "Cup");
  await run(request);
  assert.equal(calls, 1);
});
test("network failure returns an error", async (t) => {
  const run = createService({
    key: "fake",
    transport: async (url) => {
      if (url.endsWith("count_tokens"))
        return { ok: true, json: async () => ({ input_tokens: 1 }) };
      throw new Error("Disconnected");
    },
  });
  await assert.rejects(run(request), /Disconnected/);
});
test("overlarge context never sends a paid generation", async (t) => {
  let calls = 0;
  const run = createService({
    key: "fake",
    transport: async () => {
      calls++;
      return { ok: true, json: async () => ({ input_tokens: 32001 }) };
    },
  });
  await assert.rejects(run(request), /too large/);
  assert.equal(calls, 1);
});
test("invalid AI output cannot replace a scene", async (t) => {
  const run = createService({
    key: "fake",
    transport: async (url) => ({
      ok: true,
      json: async () =>
        url.endsWith("count_tokens")
          ? { input_tokens: 1 }
          : {
              stop_reason: "end_turn",
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [{ type: "text", text: "bad" }],
            },
    }),
  });
  await assert.rejects(run(request), /invalid scene/);
});
test("simultaneous generation is rejected", async (t) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const run = createService({
    key: "fake",
    transport: async (url) => {
      if (url.endsWith("count_tokens"))
        return { ok: true, json: async () => ({ input_tokens: 100 }) };
      await held;
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 100 },
          content: [{ type: "text", text: JSON.stringify(scene) }],
        }),
      };
    },
  });
  const first = run(request);
  await assert.rejects(
    run({ ...request, requestId: "second" }),
    /already being generated/,
  );
  release();
  await first;
});
test("authentication rejection gives a useful error", async (t) => {
  const run = createService({
    key: "fake",
    transport: async (url) =>
      url.endsWith("count_tokens")
        ? { ok: true, json: async () => ({ input_tokens: 100 }) }
        : { ok: false, status: 401 },
  });
  await assert.rejects(run(request), /key was rejected/);
});
test("edits send current scene and prompt without resending the photo", async (t) => {
  const run = createService({
    key: "fake",
    transport: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].content.length, 1);
      assert.equal(body.messages[0].content[0].type, "text");
      assert.ok(body.messages[0].content[0].text.includes("Make it purple"));
      return {
        ok: true,
        json: async () =>
          url.endsWith("count_tokens")
            ? { input_tokens: 100 }
            : {
                stop_reason: "end_turn",
                usage: { input_tokens: 100, output_tokens: 100 },
                content: [{ type: "text", text: JSON.stringify(scene) }],
              },
      };
    },
  });
  await run({ ...request, mode: "edit", scene, prompt: "Make it purple" });
});
test("unrecognizable photos return a retryable outcome without scene code", async (t) => {
  const outcome = {
    kind: "unrecognized",
    reason: "The image is too blurry to identify an object.",
  };
  let paidCalls = 0;
  const run = createService({
    key: "fake",
    transport: async (url) => {
      if (url.endsWith("count_tokens"))
        return { ok: true, json: async () => ({ input_tokens: 100 }) };
      paidCalls++;
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 30 },
          content: [{ type: "text", text: JSON.stringify(outcome) }],
        }),
      };
    },
  });
  const output = await run(request);
  assert.deepEqual(output.result, outcome);
  assert.equal(output.result.code, undefined);
  await run(request);
  assert.equal(paidCalls, 1);
});

test("service failures use neutral messages and permit a new attempt", async () => {
  for (const status of [429, 500, 503]) {
    let fail = true;
    const run = createService({
      key: "fake",
      transport: async (url) => {
        if (url.endsWith("count_tokens"))
          return { ok: true, json: async () => ({ input_tokens: 100 }) };
        if (fail) return { ok: false, status };
        return {
          ok: true,
          json: async () => ({
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(scene) }],
          }),
        };
      },
    });
    await assert.rejects(run(request), (error) => {
      assert.doesNotMatch(error.message, /claude|anthropic/i);
      assert.match(error.message, /service|request/i);
      return true;
    });
    fail = false;
    assert.equal(
      (await run({ ...request, requestId: "retry" })).result.name,
      "Cup",
    );
  }
});
