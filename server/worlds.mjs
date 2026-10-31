import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { savedObjects, worlds } from "./db/schema.mjs";
import { sceneSchema } from "../shared/contract.mjs";
import { worldSchema, validateWorldActions } from "../shared/world.mjs";

export function createWorlds(db, guard, generatePlan) {
  const router = Router();
  router.use(guard);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  async function resolve(world, userId) {
    const ids = [...new Set(world.members.map((m) => m.objectId))];
    const rows = await db
      .select()
      .from(savedObjects)
      .where(
        and(eq(savedObjects.userId, userId), inArray(savedObjects.id, ids)),
      )
      .all();
    if (rows.length !== ids.length) {
      throw Object.assign(
        new Error("Choose objects from your own saved collection."),
        { status: 400 },
      );
    }
    const objects = rows.map((row) => ({
      id: row.id,
      scene: sceneSchema.parse(JSON.parse(row.sceneJson)),
    }));
    try {
      validateWorldActions(world, objects);
    } catch {
      throw Object.assign(
        new Error(
          "This animation no longer matches the world. Create it again.",
        ),
        { status: 400 },
      );
    }
    return objects;
  }
  router.get("/", async (req, res, next) => {
    try {
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        return res.status(400).json({ error: "Invalid page." });
      const rows = await db
        .select({
          id: worlds.id,
          name: worlds.name,
          updatedAt: worlds.updatedAt,
        })
        .from(worlds)
        .where(eq(worlds.userId, req.account.id))
        .orderBy(desc(worlds.updatedAt), desc(worlds.id))
        .limit(21)
        .offset(offset)
        .all();
      res.json({
        worlds: rows.slice(0, 20),
        nextOffset: rows.length > 20 ? offset + 20 : null,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/preview", async (req, res, next) => {
    try {
      const world = worldSchema.parse(req.body);
      res.json({ world, objects: await resolve(world, req.account.id) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/animate", async (req, res, next) => {
    try {
      const input = z
        .object({
          world: worldSchema,
          prompt: z.string().trim().min(1).max(700),
          requestId: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      const objects = await resolve(input.world, req.account.id);
      const plan = await generatePlan({
        ...input,
        objects,
        requestId: req.account.id + ":" + input.requestId,
      });
      const world = worldSchema.parse({ ...input.world, plan });
      validateWorldActions(world, objects);
      res.json({ plan: world.plan });
    } catch (error) {
      next(error);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const input = z
        .object({ id: z.string().uuid().optional(), world: worldSchema })
        .strict()
        .parse(req.body);
      await resolve(input.world, req.account.id);
      const id = input.id ?? randomUUID();
      const values = {
        name: input.world.name,
        documentJson: JSON.stringify(input.world),
        updatedAt: Date.now(),
      };
      if (input.id) {
        const rows = await db
          .update(worlds)
          .set(values)
          .where(and(eq(worlds.id, id), eq(worlds.userId, req.account.id)))
          .returning({ id: worlds.id })
          .all();
        if (!rows.length)
          return res.status(404).json({ error: "World not found." });
      } else {
        await db
          .insert(worlds)
          .values({
            ...values,
            id,
            userId: req.account.id,
            createdAt: Date.now(),
          });
      }
      res.json({ id });
    } catch (error) {
      next(error);
    }
  });
  router.get("/:id", async (req, res, next) => {
    try {
      const [row] = await db
        .select()
        .from(worlds)
        .where(
          and(eq(worlds.id, req.params.id), eq(worlds.userId, req.account.id)),
        )
        .all();
      if (!row) return res.status(404).json({ error: "World not found." });
      const world = worldSchema.parse(JSON.parse(row.documentJson));
      res.json({
        id: row.id,
        world,
        objects: await resolve(world, req.account.id),
      });
    } catch (error) {
      next(error);
    }
  });
  router.use((error, req, res, next) => {
    const status = error instanceof z.ZodError ? 400 : (error.status ?? 500);
    res
      .status(status)
      .json({
        error:
          status === 400
            ? "Check your world objects and animation, then try again."
            : status === 500
              ? "Could not update your world. Please try again."
              : error.message,
      });
  });
  return router;
}
