import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDatabase } from '../server/db/index.mjs';
import { createAuth } from '../server/auth.mjs';
import { users, credentials, sessions } from '../server/db/schema.mjs';
test('accounts register, authenticate, revoke sessions and cascade deletion', async t=> {
  const database = openDatabase(':memory:');
  const app = express();
  app.use(express.json());
  const auth = createAuth(database.db);
  app.use('/auth', auth.router);
  app.get('/private', auth.guard, (req, res) => res.json({ id: req.account.id }));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r=> server.once('listening', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    database.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, body, token) {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})},
      ...(body ? { body: JSON.stringify(body) } : {})});
    return { status: response.status, data: await response.json() };
  }
  const details = {
    name: 'Test User',
    email: 'TEST@example.com',
    password: 'correct horse battery 123'};
  assert.equal((await call('/private')).status, 401);
  assert.equal((await call('/auth/register', { ...details, password: 'short' })).status, 400);
  const registered = await call('/auth/register', details);
  assert.equal(registered.status, 200);
  assert.equal(registered.data.user.email, 'test@example.com');
  const token = registered.data.token;
  assert.equal((await call('/auth/register', details)).status, 409);
  assert.equal(
    (await call('/auth/login', { email: details.email, password: 'wrong' })).status,
    401);
  const stored = await database.db.select().from(credentials).all();
  assert.ok(!stored[0].passwordHash.includes(details.password));
  const session = await database.db.select().from(sessions).all();
  assert.notEqual(session[0].tokenHash, token);
  assert.equal((await call('/private', null, token)).status, 200);
  assert.equal((await call('/auth/logout', {}, token)).status, 200);
  assert.equal((await call('/auth/me', null, token)).status, 401);
  let login = await call('/auth/login', details);
  assert.equal(login.status, 200);
  await database.db.update(sessions).set({ expiresAt: 0 });
  assert.equal((await call('/auth/me', null, login.data.token)).status, 401);
  login = await call('/auth/login', details);
  assert.equal(login.status, 200);
  assert.equal((await call('/auth/delete', { password: 'wrong' }, login.data.token)).status, 401);
  assert.equal(
    (await call('/auth/delete', { password: details.password }, login.data.token)).status,
    200);
  assert.equal((await database.db.select().from(users).all()).length, 0);
  assert.equal((await database.db.select().from(credentials).all()).length, 0);
  assert.equal((await database.db.select().from(sessions).all()).length, 0);
  assert.equal((await call('/private', null, login.data.token)).status, 401);
});
