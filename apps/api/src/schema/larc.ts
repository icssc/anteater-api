import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";

export const larcQuerySchema = z.object({
  instructor: z.string().optional().openapi({ example: "Peter Anteater" }),
  bldg: z.string().optional().openapi({ example: "ALP 3700" }),
  department: z.string().optional().openapi({ example: "I&C SCI" }),
  courseNumber: z.string().optional().openapi({ example: "46" }),
  year: z
    .string({ message: "Parameter 'year' is required " })
    .regex(/^\d{4}$/, { message: "Invalid year provided" })
    .openapi({ param: { name: "year", in: "query" }, example: "2024" }),
  quarter: z
    .enum(terms, {
      message:
        "Parameter 'quarter' is required and must be one of 'Fall', 'Winter', 'Spring', 'Summer1', 'Summer10wk', or 'Summer2'",
    })
    .openapi({ param: { name: "quarter", in: "query" }, example: "Fall" }),
});

export const larcSectionSchema = z.object({
  days: z.string().openapi({ example: "MTuWThF" }),
  time: z.string().openapi({ example: "5:00-5:50p" }),
  instructor: z.string().openapi({ example: "Peter Anteater" }),
  bldg: z.string().openapi({ example: "ALP 3700" }),
  websocCourse: z.object({
    deptCode: z.string().openapi({ example: "I&C SCI" }),
    courseTitle: z.string().openapi({ example: "DATA STRC IMPL&ANLS" }),
    courseNumber: z.string().openapi({ example: "46" }),
  }),
});
