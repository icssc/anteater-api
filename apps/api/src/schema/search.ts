import { z } from "@hono/zod-openapi";
import { courseSchema, inputCourseLevelSchema, inputGECategories } from "./courses.ts";
import { instructorSchema } from "./instructors.ts";

export const searchQuerySchema = z.object({
  query: z.string({ message: "Parameter 'query' is required" }),
  take: z.coerce.number().lte(100, "Page size must be less than or equal to 100").default(100),
  skip: z.coerce.number().default(0),
  resultType: z.union([z.literal("course"), z.literal("instructor")]).optional(),
  department: z.string().optional().openapi({
    description: "If searching for courses, they must be from this department",
    example: "BIO SCI",
  }),
  courseLevel: inputCourseLevelSchema.optional().openapi({
    description: "If searching for courses, they must be at this level",
  }),
  minUnits: z.coerce.number().optional().openapi({
    description: "If searching for courses, they must grant at least this many units upon passage",
  }),
  maxUnits: z.coerce.number().optional().openapi({
    description: "If searching for courses, they must grant at most this many units upon passage",
  }),
  ge: z.enum(inputGECategories).optional().openapi({
    description: "If searching for courses, they must fulfill this GE category",
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
