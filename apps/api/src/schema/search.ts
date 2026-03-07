import { z } from "@hono/zod-openapi";
import { skipBaseSchema, takeBaseSchema } from "./base";
import { courseSchema, inputCourseLevelSchema } from "./courses.ts";
import { instructorSchema } from "./instructors.ts";
import { geCategories } from "./lib";

export const searchQuerySchema = z.object({
  query: z.string({ message: "Parameter 'query' is required" }),
  take: takeBaseSchema,
  skip: skipBaseSchema,
  resultType: z.union([z.literal("course"), z.literal("instructor")]).optional(),
  department: z.coerce
    .string()
    .transform((l) => l.split(",").map((dept) => dept.trim()))
    .pipe(z.string().array())
    .optional()
    .openapi({
      description: "If searching for courses, they must be from one of these departments",
      example: "BIO SCI,GDIM",
    }),
  courseLevel: z.coerce
    .string()
    .transform((l) => l.split(",").map((dept) => dept.trim()))
    .pipe(inputCourseLevelSchema.array())
    .optional()
    .openapi({
      description: "If searching for courses, they must be at one of these levels",
      example: "Graduate,UpperDiv",
    }),
  minUnits: z.coerce.number().optional().openapi({
    description: "If searching for courses, they must grant at least this many units upon passage",
  }),
  maxUnits: z.coerce.number().optional().openapi({
    description: "If searching for courses, they must grant at most this many units upon passage",
  }),
  ge: z.coerce
    .string()
    .transform((l) => l.split(",").map((cat) => cat.trim()))
    .pipe(z.enum(geCategories).array())
    .optional()
    .openapi({
      description:
        "If searching for courses, they must fulfill at least one of these comma-separated GE categories",
      example: "GE-1A,GE-4",
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
