import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq, and, gt, lte } from 'drizzle-orm';
import { z } from 'zod';
import { users, credentials, sessions } from './db/schema.mjs';
const derive = promisify(scrypt),
  digest =t=> createHash('sha256').update(t).digest('hex');
const password = z.string().min(12).max(128),
  email = z.string().trim().toLowerCase().email().max(254);
async function hash(value) {
  const salt = randomBytes(16).toString('hex');
  return salt +
    ':' +
    (await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString(
      'hex');
}
async function verify(value, encoded) {
  const [salt, key] = encoded.split(':');
  const actual = await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}
export function createAuth(db) {
  const router = Router();
  const dummy = hash(randomBytes(32).toString('hex'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 40,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many account requests. Please try again later.' }}));
  const safe =fn=> (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  async function identify(req) {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return null;
    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name, tokenHash: sessions.tokenHash })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, Date.now())))
      .all();
    return rows[0] ?? null;
  }
  const requireUser = safe(async (req, res) => {
    const user = await identify(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.account = user;
  });
  const guard = async (req, res, next) => {
    try {
      await requireUser(req, res, next);
      if (req.account) next();
    } catch (e) {
      next(e);
    }
  };
  async function issue(res, user) {
    await db.delete(sessions).where(lte(sessions.expiresAt, Date.now()));
    const token = randomBytes(32).toString('hex');
    await db
      .insert(sessions)
      .values({ tokenHash: digest(token), userId: user.id, expiresAt: Date.now() + 30 * 86400000 });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  }
  router.post(
    '/register',
    safe(async (req, res) => {
      const input = z
        .object({ email, password, name: z.string().trim().min(1).max(80) })
        .safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: 'Enter a name, valid email, and password of 12–128 characters.' });
      const data = input.data;
      const passwordHash = await hash(data.password);
      const user = { id: randomUUID(), email: data.email, name: data.name, createdAt: Date.now() };
      try {
        await db.insert(users).values(user);
      } catch (e) {
        if (String(e.cause?.message ?? e.message).includes('UNIQUE'))
          return res
            .status(409)
            .json({ error: 'An account could not be created with these details. Try signing in.' });
        throw e;
      }
      try {
        await db.insert(credentials).values({ userId: user.id, passwordHash });
      } catch (e) {
        await db.delete(users).where(eq(users.id, user.id));
        throw e;
      }
      await issue(res, user);
    }));
  router.post(
    '/login',
    safe(async (req, res) => {
      const input = z.object({ email, password: z.string().min(1).max(128) }).safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: 'Enter your email and password.' });
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          passwordHash: credentials.passwordHash})
        .from(users)
        .innerJoin(credentials, eq(users.id, credentials.userId))
        .where(eq(users.email, input.data.email))
        .all();
      const user = rows[0];
      const valid = await verify(input.data.password, user?.passwordHash ??await dummy);
      if (!user || !valid)
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      await issue(res, user);
    }));
  router.get('/me', guard, (req, res) => {
    const { id, email, name } = req.account;
    res.json({ user: { id, email, name } });
  });
  router.post(
    '/logout',
    guard,
    safe(async (req, res) => {
      await db.delete(sessions).where(eq(sessions.tokenHash, req.account.tokenHash));
      res.json({ ok: true });
    }));
  router.post(
    '/delete',
    guard,
    safe(async (req, res) => {
      if (typeof req.body.password !== 'string' || req.body.password.length > 128)
        return res.status(400).json({ error: 'Enter your password to delete your account.' });
      const [credential] = await db
        .select()
        .from(credentials)
        .where(eq(credentials.userId, req.account.id))
        .all();
      if (!credential || !await verify(req.body.password, credential.passwordHash))return res.status(401).json({ error: 'Password is incorrect.' });
      await db.delete(users).where(eq(users.id, req.account.id));
      res.json({ ok: true });
    }));
  router.use((err, req, res, next) =>
    res.status(500).json({ error: 'Account request failed. Please try again.' }));
  return { router, guard };
}
