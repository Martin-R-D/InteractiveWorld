import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  createPhotoLimiter,
  withClientSignal,
} from "../server/request-control.mjs";
import { createScenes } from "../server/scenes.mjs";
import { createService } from "../server/service.mjs";
import { createWorldService } from "../server/world-service.mjs";

const scene = {
  kind: "scene",
  name: "Test",
  description: "Test object",
  code: 'api.material("m",{color:"#ffffff"});api.part("p",{shape:"box",material:"m"});api.action("a",{tracks:[]});',
  actions: [{ id: "a", label: "Tap" }],
};
const photo = () => ({
  mode: "generate",
  requestId: randomUUID(),
  image: { mediaType: "image/jpeg", data: "a".repeat(24) },
});

test("photo cooldown admits ten attempts, isolates accounts, and expires at the window boundary", () => {
  let now = 0;
  const limiter = createPhotoLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, false);
  assert.equal(limiter.status("a").retryAfterMs, 180000);
  assert.equal(limiter.status("b").remaining, 10);
  now = 1000;
  assert.equal(limiter.status("a").retryAfterMs, 179000);
  now = 180000;
  assert.equal(limiter.consume("a").remaining, 9);
});

test("HTTP photo limit survives status refresh, blocks request eleven, and leaves edits available", async (t) => {
  let now = 0,
    calls = 0;
  const app = express();
  app.use(express.json());
  app.use(
    "/scene",
    createScenes(
      (req, res, next) => {
        req.account = { id: req.headers["x-user"] ?? "a" };
        next();
      },
      async () => {
        calls++;
        return { result: scene };
      },
      createPhotoLimiter({ now: () => now }),
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/scene`;
  const post = (body) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post({})).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await post(photo())).status, 200);
  assert.equal(
    (await (await fetch(url + "/limits")).json()).photoLimit.remaining,
    0,
  );
  const blocked = await post(photo());
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "180");
  assert.equal(calls, 10);
  assert.equal(
    (
      await post({
        mode: "edit",
        requestId: randomUUID(),
        scene,
        prompt: "Turn",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await fetch(url + "/limits", { headers: { "x-user": "b" } })
      ).json()
    ).photoLimit.remaining,
    10,
  );
  now = 180000;
  assert.equal((await post(photo())).status, 200);
});

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}
test("client disconnect and deadline cancel server work and remove listeners", async () => {
  const res = new EventEmitter();
  let signal;
  const work = withClientSignal({}, res, (current) => {
    signal = current;
    return waitForAbort(current);
  });
  res.emit("close");
  await assert.rejects(work);
  assert.equal(signal.aborted, true);
  assert.equal(res.listenerCount("close"), 0);
  await assert.rejects(
    withClientSignal({}, res, waitForAbort, 10),
    (error) => error.status === 408 && /2 minutes/.test(error.message),
  );
  assert.equal(res.listenerCount("close"), 0);
});

test("aborting an actual HTTP connection propagates to its pending backend operation", async (t) => {
  const app = express();
  let started, cancelled;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const stopped = new Promise((resolve) => {
    cancelled = resolve;
  });
  app.post("/", async (req, res) => {
    try {
      await withClientSignal(req, res, (signal) => {
        started();
        return waitForAbort(signal);
      });
    } catch {
      cancelled();
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const controller = new AbortController();
  const response = fetch(`http://127.0.0.1:${server.address().port}`, {
    method: "POST",
    signal: controller.signal,
  });
  await ready;
  controller.abort();
  await assert.rejects(response);
  await Promise.race([
    stopped,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Disconnect did not propagate")), 2000),
    ),
  ]);
});

test("photo service cancels provider work, frees its slot and rejects late results", async () => {
  let started,
    calls = 0;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const controller = new AbortController();
  const run = createService({
    key: "test",
    transport: async (url, { signal }) => {
      if (url.endsWith("count_tokens"))
        return { ok: true, json: async () => ({ input_tokens: 100 }) };
      calls++;
      if (calls === 1) {
        started();
        return waitForAbort(signal);
      }
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(scene) }],
        }),
      };
    },
  });
  const request = photo();
  const running = run({ ...request, signal: controller.signal });
  await ready;
  controller.abort();
  await assert.rejects(running);
  assert.equal((await run(request)).result.name, "Test");
  assert.equal(calls, 2);
  const alreadyStopped = new AbortController();
  alreadyStopped.abort();
  await assert.rejects(run({ ...request, signal: alreadyStopped.signal }));
});

test("world service cancellation frees the generation slot", async () => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const controller = new AbortController();
  const member = {
    id: randomUUID(),
    objectId: randomUUID(),
    position: [0, 0, 0],
    rotation: 0,
    scale: 1,
  };
  const plan = {
    summary: "Move",
    steps: [{ memberId: member.id, at: 0, duration: 1, position: [1, 0, 0] }],
  };
  let calls = 0;
  const run = createWorldService({
    key: "test",
    transport: async (_, { signal }) => {
      if (++calls === 1) {
        started();
        return waitForAbort(signal);
      }
      return {
        ok: true,
        json: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(plan) }],
        }),
      };
    },
  });
  const request = {
    requestId: randomUUID(),
    prompt: "Move",
    world: { name: "World", members: [member], plan: null },
    objects: [{ id: member.objectId, scene }],
  };
  const running = run({ ...request, signal: controller.signal });
  await ready;
  controller.abort();
  await assert.rejects(running);
  assert.deepEqual(await run(request), plan);
});
