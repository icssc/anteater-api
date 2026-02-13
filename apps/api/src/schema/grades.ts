import { z } from "@hono/zod-openapi";
import { courseLevels, terms } from "@packages/db/schema";
import { inputGECategories, yearSchema } from "./lib";

export const gradesQuerySchema = z.object({
  year: yearSchema.optional(),
  quarter: z.enum(terms, { invalid_type_error: "Invalid quarter provided" }).optional(),
  instructor: z.string().optional().openapi({
    description: "Only include courses taught by the specified instructor (case-insensitive)",
    example: "KLEFSTAD, R.",
  }),
  department: z.string().optional().openapi({
    description: "Only include courses offered by the specified department code",
    example: "I&C SCI",
  }),
  courseNumber: z.string().optional().openapi({
    description: "Only include courses exactly matching the specified course number",
    example: "45C",
  }),
  sectionCode: z
    .string()
    .regex(/^\d{5}$/, { message: "Invalid sectionCode provided" })
    .optional()
    .openapi({ description: "The 5-digit section code", example: "35630" }),
  division: z
    .enum(courseLevels)
    .or(z.literal("ANY"))
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x)),
  ge: z
    .enum(inputGECategories)
    .optional()
    .or(z.literal("ANY"))
    .transform((x) => (x === "ANY" ? undefined : x)),
  excludePNP: z.coerce
    .string()
    .optional()
    .transform((x) => x === "true")
    .openapi({
      description: "If true, excludes courses that are graded only on a Pass/No Pass basis",
      example: "true",
    }),
});

const gradeBaseShape = z.object({
  gradeACount: z.number(),
  gradeBCount: z.number(),
  gradeCCount: z.number(),
  gradeDCount: z.number(),
  gradeFCount: z.number(),
  gradePCount: z.number(),
  gradeNPCount: z.number(),
  gradeWCount: z.number(),
  averageGPA: z.number().nullable(),
});

const sectionShape = z.object({
  year: z.string(),
  quarter: z.enum(terms),
  sectionCode: z.string(),
  department: z.string(),
  courseNumber: z.string(),
  courseNumeric: z.number(),
  geCategories: z.enum(inputGECategories).array(),
  instructors: z.string().array(),
});

export const rawGradeSchema = gradeBaseShape.extend(sectionShape.shape);

export const gradesOptionsSchema = z.object({
  years: z.string().array(),
  departments: z.string().array(),
  sectionCodes: z.string().array(),
  instructors: z.string().array(),
});

export const aggregateGradesSchema = z.object({
  sectionList: sectionShape.array(),
  gradeDistribution: gradeBaseShape,
});

export const aggregateGradeByCourseSchema = gradeBaseShape.extend({
  department: z.string(),
  courseNumber: z.string(),
});

export const aggregateGradeByOfferingSchema = aggregateGradeByCourseSchema.extend({
  instructor: z.string(),
});
