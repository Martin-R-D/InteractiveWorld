import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase } from "../server/db/index.mjs";
import { createAuth } from "../server/auth.mjs";
import { createObjects } from "../server/objects.mjs";
import { createWorlds } from "../server/worlds.mjs";
import { users, worlds } from "../server/db/schema.mjs";
import { worldSchema, planSchema } from "../shared/world.mjs";
import { makeWorld, sampleWorld, resetWorld } from "../viewer/world.mjs";
import { dispose } from "../viewer/model.mjs";
import { createWorldService } from "../server/world-service.mjs";

const scene = {
  kind: "scene",
  name: "Block",
  description: "A green block",
  code: 'api.material("green",{color:"#55aa55"});api.part("body",{shape:"box",size:[2,2,2],material:"green",action:"bounce"});api.action("bounce",{tracks:[{part:"body",property:"position.y",mode:"sine",value:0.2,seconds:1}]});',
  actions: [{ id: "bounce", label: "Bounce" }],
};
const member = () => ({
  id: randomUUID(),
  objectId: randomUUID(),
  position: [0, 0, 0],
  rotation: 0,
  scale: 1,
});

test("world migration preserves accounts and saved worlds survive database reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "iw-world-persistence-"));
  const filename = join(directory, "test.db");
  let database = openDatabase(filename);
  try {
    const userId = randomUUID();
    await database.db.insert(users).values({
      id: userId,
      email: "persist@example.com",
      name: "Test",
      createdAt: 1,
    });
    const document = {
      name: "Persistent world",
      members: [member()],
      plan: null,
    };
    await database.db.insert(worlds).values({
      id: randomUUID(),
      userId,
      name: document.name,
      documentJson: JSON.stringify(document),
      createdAt: 1,
      updatedAt: 2,
    });
    database.close();
    database = openDatabase(filename);
    assert.equal((await database.db.select().from(users).all()).length, 1);
    const [saved] = await database.db.select().from(worlds).all();
    assert.deepEqual(JSON.parse(saved.documentJson), document);
    assert.equal(saved.userId, userId);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("world API only accepts owned saved objects and isolates world reads and updates", async (t) => {
  const database = openDatabase(":memory:");
  const app = express();
  app.use(express.json());
  const auth = createAuth(database.db);
  let generated = 0;
  app.use("/auth", auth.router);
  app.use("/objects", createObjects(database.db, auth.guard));
  app.use(
    "/worlds",
    createWorlds(database.db, auth.guard, async ({ world }) => {
      generated++;
      return {
        summary: "Move together",
        steps: [
          {
            memberId: world.members[0].id,
            at: 0,
            duration: 2,
            position: [2, 0, 0],
          },
        ],
      };
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    database.close();
  });
  async function call(path, token, body) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  }
  const a = (
    await call("/auth/register", null, {
      email: "world-a@example.com",
      name: "A",
      password: "test-password-12345",
    })
  ).data;
  const b = (
    await call("/auth/register", null, {
      email: "world-b@example.com",
      name: "B",
      password: "test-password-12345",
    })
  ).data;
  const object = (await call("/objects", a.token, { scene })).data;
  const world = {
    name: "Together",
    members: [{ ...member(), objectId: object.id }],
    plan: null,
  };
  assert.equal((await call("/worlds")).status, 401);
  assert.equal((await call("/worlds/preview", b.token, world)).status, 400);
  assert.equal((await call("/worlds", b.token, { world })).status, 400);
  assert.equal(
    (
      await call("/worlds/animate", b.token, {
        world,
        prompt: "Move",
        requestId: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(generated, 0);
  assert.equal(
    (await call("/worlds/preview", a.token, { ...world, objects: [{ scene }] }))
      .status,
    400,
  );
  assert.deepEqual(
    (await call("/worlds/preview", a.token, world)).data.objects[0].scene,
    scene,
  );
  const animation = await call("/worlds/animate", a.token, {
    world,
    prompt: "Move",
    requestId: randomUUID(),
  });
  assert.equal(animation.status, 200);
  world.plan = animation.data.plan;
  const saved = await call("/worlds", a.token, { world });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    (await call("/worlds/" + saved.data.id, a.token)).data.world,
    world,
  );
  assert.equal((await call("/worlds/" + saved.data.id, b.token)).status, 404);
  const bObject = (await call("/objects", b.token, { scene })).data;
  assert.equal(
    (
      await call("/worlds", b.token, {
        id: saved.data.id,
        world: {
          ...world,
          members: [{ ...world.members[0], objectId: bObject.id }],
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/worlds", a.token, {
        id: saved.data.id,
        world: { ...world, name: "Renamed" },
      })
    ).status,
    200,
  );
  assert.equal((await call("/worlds", a.token)).data.worlds[0].name, "Renamed");
  assert.equal((await call("/worlds", b.token)).data.worlds.length, 0);
  const badPlan = {
    summary: "Bad action",
    steps: [
      {
        memberId: world.members[0].id,
        at: 0,
        duration: 1,
        actionId: "missing",
      },
    ],
  };
  assert.equal(
    (await call("/worlds", a.token, { world: { ...world, plan: badPlan } }))
      .status,
    400,
  );
  await database.db.delete(users).where(eq(users.id, a.user.id));
  assert.equal((await database.db.select().from(worlds).all()).length, 0);
});

test("composition namespaces actions, preserves source, normalizes ground and replays deterministically", () => {
  const first = member(),
    second = { ...member(), position: [3, 0, 0] };
  const plan = {
    summary: "Climb",
    steps: [
      { memberId: first.id, at: 0, duration: 2, position: [0, 3, 0] },
      { memberId: first.id, at: 2, duration: 2, position: [3, 3, 0] },
    ],
  };
  const data = {
    world: { name: "World", members: [first, second], plan },
    objects: [
      { id: first.objectId, scene },
      { id: second.objectId, scene },
    ],
  };
  const original = JSON.stringify(data);
  const model = makeWorld(data);
  try {
    assert.equal(model.actions.size, 2);
    assert.ok(model.actions.has(first.id + ":bounce"));
    assert.equal(model.box.min.y, 0);
    assert.deepEqual(model.members.get(first.id).size, [2.5, 2.5, 2.5]);
    sampleWorld(model, 1);
    assert.deepEqual(
      model.members.get(first.id).container.position.toArray(),
      [0, 1.5, 0],
    );
    sampleWorld(model, 4);
    assert.deepEqual(
      model.members.get(first.id).container.position.toArray(),
      [3, 3, 0],
    );
    resetWorld(model);
    assert.deepEqual(
      model.members.get(first.id).container.position.toArray(),
      [0, 0, 0],
    );
    sampleWorld(model, 3);
    assert.deepEqual(
      model.members.get(first.id).container.position.toArray(),
      [1.5, 3, 0],
    );
    assert.equal(JSON.stringify(data), original);
  } finally {
    dispose(model);
  }
});

test("world limits reject unsafe, overlapping and dangling animation steps", () => {
  const m = member();
  const step = { memberId: m.id, at: 0, duration: 2, position: [0, 0, 0] };
  assert.equal(
    planSchema.safeParse({ summary: "Test", steps: [step, step] }).success,
    false,
  );
  assert.equal(
    planSchema.safeParse({ summary: "Test", steps: [{ ...step, at: 19 }] })
      .success,
    false,
  );
  assert.equal(
    planSchema.safeParse({
      summary: "Test",
      steps: [{ ...step, position: [Infinity, 0, 0] }],
    }).success,
    false,
  );
  assert.equal(
    worldSchema.safeParse({ name: "Test", members: [m, m] }).success,
    false,
  );
  assert.equal(
    worldSchema.safeParse({
      name: "Test",
      members: Array.from({ length: 5 }, member),
    }).success,
    false,
  );
  assert.equal(
    worldSchema.safeParse({
      name: "Test",
      members: [member()],
      plan: { summary: "Test", steps: [step] },
    }).success,
    false,
  );
});

test("world AI uses configured Sonnet effort, excludes source code and rejects invented actions", async () => {
  const m = member();
  let payload;
  let calls = 0;
  const plan = {
    summary: "Bounce",
    steps: [{ memberId: m.id, at: 0, duration: 2, actionId: "bounce" }],
  };
  const generate = createWorldService({
    key: "test",
    transport: async (_, options) => {
      calls++;
      payload = JSON.parse(options.body);
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
    world: { name: "World", members: [m], plan: null },
    objects: [{ id: m.objectId, scene }],
    prompt: "Bounce",
    requestId: randomUUID(),
  };
  assert.deepEqual(await generate(request), plan);
  await generate(request);
  assert.equal(calls, 1);
  assert.equal(payload.model, "claude-sonnet-5-5");
  assert.equal(payload.max_tokens, 16000);
  assert.deepEqual(payload.thinking, { type: "between_tools" });
  assert.equal(payload.output_config.effort, "low");
  assert.equal(payload.messages[0].content.includes(scene.code), false);
  plan.steps[0].actionId = "invented";
  await assert.rejects(
    generate({ ...request, requestId: randomUUID() }),
    /Could not create/,
  );
});
