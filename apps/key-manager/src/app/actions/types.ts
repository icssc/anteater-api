import { z } from "zod";

export const baseKeySchema = z
  .object({
    _type: z.enum(["publishable", "secret"], {
      message: "Key type is required",
    }),
    name: z
      .string({ message: "Name is required" })
      .min(1, { message: "Name is required" })
      .max(30, { message: "Name must be 30 characters or less" }),
    createdAt: z.date(),
  })
  .strict();

export const privilegedBaseKeySchema = baseKeySchema
  .extend({
    rateLimitOverride: z.number().optional(),
    resources: z.record(z.boolean()).optional(),
  })
  .strict();

export const publishableKeySchema = baseKeySchema
  .extend({
    _type: z.literal("publishable"),
    origins: z
      .array(
        z
          .string()
          .min(1, { message: "Origins cannot be empty" })
          .regex(/^https?:\/\//, {
            message: "Origins must use http:// or https://",
          }),
      )
      .nonempty({
        message: "At least one origin is required for publishable keys",
      })
      .refine(
        (origins) => {
          const uniqueOrigins = new Set(origins);
          return uniqueOrigins.size === origins.length;
        },
        { message: "Origins must be unique" },
      ),
  })
  .strict()
  .transform((data) => {
    const origins: Record<string, boolean> = {};

    for (const origin of data.origins) {
      origins[origin] = true;
    }

    return { ...data, origins };
  });

export const secretKeySchema = baseKeySchema
  .extend({
    _type: z.literal("secret"),
  })
  .strict();
