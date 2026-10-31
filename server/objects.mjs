import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { sceneSchema } from '../shared/contract.mjs';
import { savedObjects } from './db/schema.mjs';
export function createObjects(db, guard) {
  const router = Router();
  router.use(guard);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/', async (req, res, next) => {
    try {
      const parsed = sceneSchema.safeParse(req.body.scene);
      if (!parsed.success)
        return res
          .status(400)
          .json({ error: 'This object cannot be saved. Try generating it again.' });
      const scene = parsed.data,
        sceneJson = JSON.stringify(scene),
        sceneHash = createHash('sha256').update(sceneJson).digest('hex');
      await db
        .insert(savedObjects)
        .values({
          id: randomUUID(),
          userId: req.account.id,
          name: scene.name,
          description: scene.description,
          sceneJson,
          sceneHash,
          createdAt: Date.now()})
        .onConflictDoNothing();
      const [object] = await db
        .select({ id: savedObjects.id })
        .from(savedObjects)
        .where(and(eq(savedObjects.userId, req.account.id), eq(savedObjects.sceneHash, sceneHash)))
        .all();
      res.json({ id: object.id });
    } catch (e) {
      next(e);
    }
  });
  router.get('/', async (req, res, next) => {
    try {
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        return res.status(400).json({ error: 'Invalid page.' });
      const objects = await db
        .select({
          id: savedObjects.id,
          name: savedObjects.name,
          description: savedObjects.description,
          createdAt: savedObjects.createdAt})
        .from(savedObjects)
        .where(eq(savedObjects.userId, req.account.id))
        .orderBy(desc(savedObjects.createdAt), desc(savedObjects.id))
        .limit(21)
        .offset(offset)
        .all();
      res.json({
        objects: objects.slice(0, 20),
        nextOffset: objects.length > 20 ? offset + 20 : null});
    } catch (e) {
      next(e);
    }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const [object] = await db
        .select()
        .from(savedObjects)
        .where(and(eq(savedObjects.id, req.params.id), eq(savedObjects.userId, req.account.id)))
        .all();
      if (!object) return res.status(404).json({ error: 'Saved object not found.' });
      res.json({ id: object.id, scene: sceneSchema.parse(JSON.parse(object.sceneJson)) });
    } catch (e) {
      next(e);
    }
  });
  router.use((err, req, res, next) =>
    res.status(500).json({ error: 'Could not access saved objects. Please try again.' }));
  return router;
}
