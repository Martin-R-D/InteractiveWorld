import { Router } from "express";
import { requestSchema } from "../shared/contract.mjs";
import { createPhotoLimiter, withClientSignal } from "./request-control.mjs";

export function createScenes(guard, generate, limiter = createPhotoLimiter()) {
  const router = Router();
  router.use(guard);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/limits", (req, res) =>
    res.json({ photoLimit: limiter.status(req.account.id) }),
  );
  router.post("/", async (req, res, next) => {
    let photoLimit;
    try {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            error: "Invalid request. Check the image, scene and prompt.",
          });
      if (parsed.data.mode === "generate") {
        photoLimit = limiter.consume(req.account.id);
        if (!photoLimit.allowed) {
          res.set(
            "Retry-After",
            String(Math.ceil(photoLimit.retryAfterMs / 1000)),
          );
          return res
            .status(429)
            .json({
              error:
                "Photo analysis limit reached. Please wait for the countdown.",
              photoLimit,
            });
        }
      }
      const output = await withClientSignal(req, res, (signal) =>
        generate({
          ...parsed.data,
          requestId: req.account.id + ":" + parsed.data.requestId,
          signal,
        }),
      );
      if (!res.destroyed)
        res.json({ ...output, photoLimit: limiter.status(req.account.id) });
    } catch (error) {
      if (res.destroyed) return;
      if (photoLimit) {
        const status = error.status ?? 500;
        return res.status(status).json({
          error:
            status === 500
              ? "Scene request failed. Your previous scene is safe."
              : error.message,
          photoLimit: limiter.status(req.account.id),
        });
      }
      next(error);
    }
  });
  return router;
}
