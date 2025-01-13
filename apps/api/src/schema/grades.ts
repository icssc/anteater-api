import { z } from "@hono/zod-openapi";
import { courseLevels, terms } from "@packages/db/schema";

const geCategories = [
  "GE-1A",
  "GE-1B",
  "GE-2",
  "GE-3",
  "GE-4",
  "GE-5A",
  "GE-5B",
  "GE-6",
  "GE-7",
  "GE-8",
] as const;

export const gradesQuerySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, { message: "Invalid year provided" })
    .optional(),
  quarter: z.enum(terms, { invalid_type_error: "Invalid quarter provided" }).optional(),
  instructor: z.string().optional(),
  department: z.string().optional(),
  courseNumber: z.string().optional(),
  sectionCode: z
    .string()
    .regex(/^\d{5}$/, { message: "Invalid sectionCode provided" })
    .optional(),
  division: z
    .enum(courseLevels)
    .or(z.literal("ANY"))
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x)),
  ge: z
    .enum(geCategories)
    .optional()
    .or(z.literal("ANY"))
    .transform((x) => (x === "ANY" ? undefined : x)),
  excludePNP: z.coerce
    .string()
    .optional()
    .transform((x) => x === "true"),
});

export const rawGradeSchema = z.object({
  year: z.string(),
  quarter: z.enum(terms),
  sectionCode: z.string(),
  department: z.string(),
  courseNumber: z.string(),
  courseNumeric: z.number(),
  geCategories: z.enum(geCategories).array(),
  instructors: z.string().array(),
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

export const gradesOptionsSchema = z.object({
  years: z.string().array(),
  departments: z.string().array(),
  sectionCodes: z.string().array(),
  instructors: z.string().array(),
});

export const aggregateGradesSchema = z.object({
  sectionList: z
    .object({
      year: z.string(),
      quarter: z.enum(terms),
      sectionCode: z.string(),
      department: z.string(),
      courseNumber: z.string(),
      courseNumeric: z.number(),
      geCategories: z.enum(geCategories).array(),
      instructors: z.string().array(),
    })
    .array(),
  gradeDistribution: z.object({
    gradeACount: z.number(),
    gradeBCount: z.number(),
    gradeCCount: z.number(),
    gradeDCount: z.number(),
    gradeFCount: z.number(),
    gradePCount: z.number(),
    gradeNPCount: z.number(),
    gradeWCount: z.number(),
    averageGPA: z.number().nullable(),
  }),
});

export const aggregateGradeByCourseSchema = z.object({
  department: z.string(),
  courseNumber: z.string(),
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

export const aggregateGradeByOfferingSchema = z.object({
  department: z.string(),
  courseNumber: z.string(),
  instructor: z.string(),
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
