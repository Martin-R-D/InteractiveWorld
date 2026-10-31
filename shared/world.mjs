import { z } from "zod";

export const MAX_WORLD_OBJECTS = 4;
const coordinate = z.number().finite().min(-8).max(8);
const position = z.tuple([
  coordinate,
  z.number().finite().min(0).max(8),
  coordinate,
]);
export const memberSchema = z
  .object({
    id: z.string().uuid(),
    objectId: z.string().uuid(),
    position,
    rotation: z
      .number()
      .finite()
      .min(-Math.PI * 2)
      .max(Math.PI * 2),
    scale: z.number().finite().min(0.3).max(2),
  })
  .strict();
export const planSchema = z
  .object({
    summary: z.string().trim().min(1).max(300),
    steps: z
      .array(
        z
          .object({
            memberId: z.string().uuid(),
            at: z.number().finite().min(0).max(19),
            duration: z.number().finite().min(0.2).max(10),
            position: position.optional(),
            rotation: z
              .number()
              .finite()
              .min(-Math.PI * 2)
              .max(Math.PI * 2)
              .optional(),
            actionId: z.string().max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict()
  .superRefine((plan, ctx) => {
    for (const step of plan.steps) {
      if (
        step.at + step.duration > 20 ||
        (step.position === undefined &&
          step.rotation === undefined &&
          !step.actionId)
      ) {
        ctx.addIssue({ code: "custom", message: "Invalid animation step." });
      }
    }
    for (let i = 0; i < plan.steps.length; i++) {
      const a = plan.steps[i];
      for (const b of plan.steps.slice(i + 1)) {
        if (
          a.memberId === b.memberId &&
          a.at < b.at + b.duration &&
          b.at < a.at + a.duration
        ) {
          ctx.addIssue({
            code: "custom",
            message: "An object cannot have overlapping steps.",
          });
        }
      }
    }
  });
export const worldSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    members: z.array(memberSchema).min(1).max(MAX_WORLD_OBJECTS),
    plan: planSchema.nullable().default(null),
  })
  .strict()
  .superRefine((world, ctx) => {
    if (new Set(world.members.map((m) => m.id)).size !== world.members.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate world object." });
    }
    if (
      world.plan?.steps.some(
        (step) => !world.members.some((m) => m.id === step.memberId),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Animation references an absent object.",
      });
    }
  });

export function validateWorldActions(world, objects) {
  for (const step of world.plan?.steps ?? []) {
    const member = world.members.find((m) => m.id === step.memberId);
    const scene = objects.find((o) => o.id === member?.objectId)?.scene;
    if (
      !scene ||
      (step.actionId && !scene.actions.some((a) => a.id === step.actionId))
    ) {
      throw new Error("Animation references an unavailable object action.");
    }
  }
}
