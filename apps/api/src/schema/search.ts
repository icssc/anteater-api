import { z } from "@hono/zod-openapi";
import { courseSchema } from "./courses.ts";
import { instructorSchema } from "./instructors.ts";

export const searchQuerySchema = z.object({
  query: z
    .string({
      message: "Parameter 'query' is required",
    })
    .openapi({
      description: "The text to search for in course titles, descriptions, and instructor names",
      example: "shindler",
    }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({
      description: "Number of results to return (max 100)",
      example: 50,
    }),
  skip: z.coerce.number().default(0).openapi({
    description: "Number of results to skip for pagination",
    example: 0,
  }),
  resultType: z
    .union([z.literal("course"), z.literal("instructor")])
    .optional()
    .openapi({
      description: "Filter results to only courses or instructors",
      example: "course",
    }),
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

export const searchResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  results: searchResultSchema.array(),
});
