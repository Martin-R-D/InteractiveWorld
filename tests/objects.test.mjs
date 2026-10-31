import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db/index.mjs';
import { createAuth } from '../server/auth.mjs';
import { createObjects } from '../server/objects.mjs';
import { users, savedObjects } from '../server/db/schema.mjs';
import { eq } from 'drizzle-orm';
test('saved objects persist, deduplicate, preserve scene data and enforce account ownership', async t=> {
  const dir = mkdtempSync(join(tmpdir(), 'iw-objects-'));
  let database = openDatabase(join(dir, 'test.db'));
  const app = express();
  app.use(express.json());
  const auth = createAuth(database.db);
  app.use('/auth', auth.router);
  app.use('/objects', createObjects(database.db, auth.guard));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r=> server.once('listening', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(path, token, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})},
      ...(body ? { body: JSON.stringify(body) } : {})});
    return { status: response.status, data: await response.json() };
  }
  const a = (
    await call('/auth/register', null, {
      email: 'a@example.com',
      name: 'A',
      password: 'test-password-long-123'})
  ).data;
  const b = (
    await call('/auth/register', null, {
      email: 'b@example.com',
      name: 'B',
      password: 'test-password-long-123'})
  ).data;
  const scene = {
    kind: 'scene',
    name: 'Pen',
    description: 'A pen',
    code: 'api.part("pen",{});',
    actions: [{ id: 'click', label: 'Click', sound: 'pen-click' }]};
  assert.equal((await call('/objects')).status, 401);
  assert.equal((await call('/objects', a.token, { scene: {} })).status, 400);
  const saved = await call('/objects', a.token, { scene });
  assert.equal(saved.status, 200);
  assert.equal((await call('/objects', a.token, { scene })).data.id, saved.data.id);
  assert.deepEqual((await call('/objects/' + saved.data.id, a.token)).data.scene, scene);
  assert.equal((await call('/objects/' + saved.data.id, b.token)).status, 404);
  assert.equal((await call('/objects', b.token)).data.objects.length, 0);
  assert.equal((await call('/objects', a.token)).data.objects.length, 1);
  assert.equal((await call('/objects?offset=-1', a.token)).status, 400);
  for (let i = 0; i < 21; i++)
    await call('/objects', a.token, { scene: { ...scene, name: 'Pen ' + i } });
  const page1 = (await call('/objects', a.token)).data,
    page2 = (await call('/objects?offset=20', a.token)).data;
  assert.equal(page1.objects.length, 20);
  assert.equal(page1.nextOffset, 20);
  assert.equal(page2.objects.length, 2);
  assert.equal(page2.nextOffset, null);
  assert.ok(page1.objects.every(a=> page2.objects.every(b=> a.id !== b.id)));
  database.close();
  database = openDatabase(join(dir, 'test.db'));
  assert.equal((await database.db.select().from(savedObjects).all()).length, 22);
  assert.equal((await database.db.select().from(users).all()).length, 2);
  await database.db.delete(users).where(eq(users.id, a.user.id));
  assert.equal((await database.db.select().from(savedObjects).all()).length, 0);
});
