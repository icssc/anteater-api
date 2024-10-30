import { z } from "@hono/zod-openapi";
import { courseSchema } from "./courses.ts";
import { instructorSchema } from "./instructors.ts";

export const searchQuerySchema = z.object({
  query: z.string(),
  take: z.coerce
    .number()
    .default(100)
    .refine((x) => x <= 100, "Page size must be smaller than 100"),
  skip: z.coerce.number().default(0),
});

export const searchResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("course"),
    result: courseSchema,
    rank: z.number(),
  }),
  z.object({
    type: z.literal("instructor"),
    result: instructorSchema,
    rank: z.number(),
  }),
]);