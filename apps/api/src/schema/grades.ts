import { z } from "@hono/zod-openapi";
import { courseLevels, terms } from "@packages/db/schema";
import { geCategories, yearSchema } from "./lib";

export const gradesQuerySchema = z.object({
  year: yearSchema.optional(),
  quarter: z.enum(terms, { invalid_type_error: "Invalid quarter provided" }).optional(),
  instructor: z
    .string()
    .optional()
    .openapi({
      description: "The instructor's last name and first initial",
      example: "KLEFSTAD, R.",
    }),
  department: z
    .string()
    .optional()
    .openapi({ description: "The department code", example: "I&C SCI" }),
  courseNumber: z.string().optional().openapi({ description: "The course number", example: "45C" }),
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
    .enum(geCategories)
    .optional()
    .or(z.literal("ANY"))
    .transform((x) => (x === "ANY" ? undefined : x)),
  excludePNP: z.coerce
    .string()
    .optional()
    .transform((x) => x === "true")
    .openapi({ description: "Whether to exclude Pass/No Pass grades", example: "true" }),
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
