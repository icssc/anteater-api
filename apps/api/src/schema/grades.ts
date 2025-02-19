import { z } from "@hono/zod-openapi";
import { courseLevels, terms } from "@packages/db/schema";
import { yearSchema } from "./lib";

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
  year: yearSchema.optional().openapi({
    description: "The academic year to search for grade distributions",
    example: "2024",
  }),
  quarter: z
    .enum(terms, {
      invalid_type_error: "Invalid quarter provided",
    })
    .optional()
    .openapi({
      description: "The academic quarter to search for grade distributions",
      example: "Fall",
    }),
  instructor: z.string().optional().openapi({
    description: "The name of the instructor who taught the course",
    example: "PATTIS, R.",
  }),
  department: z.string().optional().openapi({
    description: "The academic department that offered the course",
    example: "COMPSCI",
  }),
  courseNumber: z.string().optional().openapi({
    description: "The course number to search for",
    example: "161",
  }),
  sectionCode: z
    .string()
    .regex(/^\d{5}$/, { message: "Invalid sectionCode provided" })
    .optional()
    .openapi({
      description: "The unique 5-digit code that identifies a specific course section",
      example: "34050",
    }),
  division: z
    .enum(courseLevels)
    .or(z.literal("ANY"))
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x))
    .openapi({
      description: "The academic level of the course (Lower Division, Upper Division, or Graduate)",
      example: "UpperDiv",
    }),
  ge: z
    .enum(geCategories)
    .optional()
    .or(z.literal("ANY"))
    .transform((x) => (x === "ANY" ? undefined : x))
    .openapi({
      description: "The General Education category fulfilled by the course",
      example: "GE-2",
    }),
  excludePNP: z.coerce
    .string()
    .optional()
    .transform((x) => x === "true")
    .openapi({
      description: "Whether to exclude Pass/No Pass grades from the results",
      example: "true",
    }),
});

export const rawGradeSchema = z.object({
  year: z.string().openapi({
    description: "Academic year of the grade record",
    example: "2024",
  }),
  quarter: z.enum(terms).openapi({
    description: "Academic quarter of the grade record",
    example: "Fall",
  }),
  sectionCode: z.string().openapi({
    description: "5-digit section code",
    example: "34050",
  }),
  department: z.string().openapi({
    description: "Department code",
    example: "COMPSCI",
  }),
  courseNumber: z.string().openapi({
    description: "Course number",
    example: "161",
  }),
  courseNumeric: z.number().openapi({
    description: "Numeric course number",
    example: 161,
  }),
  geCategories: z
    .enum(geCategories)
    .array()
    .openapi({
      description: "GE categories fulfilled by this course",
      example: ["GE-1A", "GE-2"],
    }),
  instructors: z
    .string()
    .array()
    .openapi({
      description: "List of instructors who taught this section",
      example: ["PATTIS, R.", "SHINDLER, M."],
    }),
  gradeACount: z.number().openapi({
    description: "Number of A grades given",
    example: 45,
  }),
  gradeBCount: z.number().openapi({
    description: "Number of B grades given",
    example: 32,
  }),
  gradeCCount: z.number().openapi({
    description: "Number of C grades given",
    example: 15,
  }),
  gradeDCount: z.number().openapi({
    description: "Number of D grades given",
    example: 5,
  }),
  gradeFCount: z.number().openapi({
    description: "Number of F grades given",
    example: 3,
  }),
  gradePCount: z.number().openapi({
    description: "Number of Pass grades given",
    example: 10,
  }),
  gradeNPCount: z.number().openapi({
    description: "Number of No Pass grades given",
    example: 2,
  }),
  gradeWCount: z.number().openapi({
    description: "Number of Withdrawal grades given",
    example: 1,
  }),
  averageGPA: z.number().nullable().openapi({
    description: "Average GPA for the section (null if not available)",
    example: 3.45,
  }),
});

export const gradesOptionsSchema = z.object({
  years: z
    .string()
    .array()
    .openapi({
      description: "List of academic years with available grade data",
      example: ["2024", "2023", "2022"],
    }),
  departments: z
    .string()
    .array()
    .openapi({
      description: "List of departments with available grade data",
      example: ["COMPSCI", "I&C SCI", "IN4MATX"],
    }),
  sectionCodes: z
    .string()
    .array()
    .openapi({
      description: "List of available section codes",
      example: ["34050", "34060", "34070"],
    }),
  instructors: z
    .string()
    .array()
    .openapi({
      description: "List of instructors who have taught courses",
      example: ["PATTIS, R.", "SHINDLER, M.", "THORNTON, A."],
    }),
});

export const gradesOptionsResponseSchema = z.object({
  ok: z.literal(true).openapi({
    description: "Indicates if the request was successful",
    example: true,
  }),
  data: gradesOptionsSchema.openapi({
    description: "Available filter options for grades queries",
  }),
});

export const aggregateGradesSchema = z.object({
  sectionList: z
    .object({
      year: z.string().openapi({
        description: "Academic year of the section",
        example: "2024",
      }),
      quarter: z.enum(terms).openapi({
        description: "Academic quarter of the section",
        example: "Fall",
      }),
      sectionCode: z.string().openapi({
        description: "5-digit section code",
        example: "34050",
      }),
      department: z.string().openapi({
        description: "Department code",
        example: "COMPSCI",
      }),
      courseNumber: z.string().openapi({
        description: "Course number",
        example: "161",
      }),
      courseNumeric: z.number().openapi({
        description: "Numeric course number",
        example: 161,
      }),
      geCategories: z
        .enum(geCategories)
        .array()
        .openapi({
          description: "GE categories fulfilled by this course",
          example: ["GE-1A", "GE-2"],
        }),
      instructors: z
        .string()
        .array()
        .openapi({
          description: "List of instructors who taught this section",
          example: ["PATTIS, R.", "SHINDLER, M."],
        }),
    })
    .array(),
  gradeDistribution: z.object({
    gradeACount: z.number().openapi({
      description: "Number of A grades given",
      example: 45,
    }),
    gradeBCount: z.number().openapi({
      description: "Number of B grades given",
      example: 32,
    }),
    gradeCCount: z.number().openapi({
      description: "Number of C grades given",
      example: 15,
    }),
    gradeDCount: z.number().openapi({
      description: "Number of D grades given",
      example: 5,
    }),
    gradeFCount: z.number().openapi({
      description: "Number of F grades given",
      example: 3,
    }),
    gradePCount: z.number().openapi({
      description: "Number of Pass grades given",
      example: 10,
    }),
    gradeNPCount: z.number().openapi({
      description: "Number of No Pass grades given",
      example: 2,
    }),
    gradeWCount: z.number().openapi({
      description: "Number of Withdrawal grades given",
      example: 1,
    }),
    averageGPA: z.number().nullable().openapi({
      description: "Average GPA for the sections (null if not available)",
      example: 3.45,
    }),
  }),
});

export const aggregateGradesResponseSchema = z.object({
  ok: z.literal(true).openapi({
    description: "Indicates if the request was successful",
    example: true,
  }),
  data: aggregateGradesSchema.openapi({
    description: "Aggregated grade distribution data",
  }),
});

export const aggregateGradeByCourseSchema = z.object({
  department: z.string().openapi({
    description: "Department code",
    example: "COMPSCI",
  }),
  courseNumber: z.string().openapi({
    description: "Course number",
    example: "161",
  }),
  gradeACount: z.number().openapi({
    description: "Number of A grades given",
    example: 45,
  }),
  gradeBCount: z.number().openapi({
    description: "Number of B grades given",
    example: 32,
  }),
  gradeCCount: z.number().openapi({
    description: "Number of C grades given",
    example: 15,
  }),
  gradeDCount: z.number().openapi({
    description: "Number of D grades given",
    example: 5,
  }),
  gradeFCount: z.number().openapi({
    description: "Number of F grades given",
    example: 3,
  }),
  gradePCount: z.number().openapi({
    description: "Number of Pass grades given",
    example: 10,
  }),
  gradeNPCount: z.number().openapi({
    description: "Number of No Pass grades given",
    example: 2,
  }),
  gradeWCount: z.number().openapi({
    description: "Number of Withdrawal grades given",
    example: 1,
  }),
  averageGPA: z.number().nullable().openapi({
    description: "Average GPA for the course (null if not available)",
    example: 3.45,
  }),
});

export const aggregateGradeByOfferingSchema = z.object({
  department: z.string().openapi({
    description: "Department code",
    example: "COMPSCI",
  }),
  courseNumber: z.string().openapi({
    description: "Course number",
    example: "161",
  }),
  instructor: z.string().openapi({
    description: "Instructor name",
    example: "PATTIS, R.",
  }),
  gradeACount: z.number().openapi({
    description: "Number of A grades given",
    example: 45,
  }),
  gradeBCount: z.number().openapi({
    description: "Number of B grades given",
    example: 32,
  }),
  gradeCCount: z.number().openapi({
    description: "Number of C grades given",
    example: 15,
  }),
  gradeDCount: z.number().openapi({
    description: "Number of D grades given",
    example: 5,
  }),
  gradeFCount: z.number().openapi({
    description: "Number of F grades given",
    example: 3,
  }),
  gradePCount: z.number().openapi({
    description: "Number of Pass grades given",
    example: 10,
  }),
  gradeNPCount: z.number().openapi({
    description: "Number of No Pass grades given",
    example: 2,
  }),
  gradeWCount: z.number().openapi({
    description: "Number of Withdrawal grades given",
    example: 1,
  }),
  averageGPA: z.number().nullable().openapi({
    description: "Average GPA for the instructor's offerings (null if not available)",
    example: 3.45,
  }),
});
