import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";

export const larcQuerySchema = z
  .object({
    instructor: z.string().optional().openapi({ example: "Peter Anteater" }),
    bldg: z.string().optional().openapi({ example: "ALP 3700" }),
    department: z.string().optional().openapi({ example: "I&C SCI" }),
    courseNumber: z.string().optional().openapi({ example: "46" }),
    year: z
      .string()
      .regex(/^\d{4}$/, { message: "Invalid year provided" })
      .optional()
      .openapi({ param: { name: "year", in: "query" }, example: "2024" }),
    quarter: z
      .enum(terms, {
        message:
          "Parameter 'quarter' must be one of 'Fall', 'Winter', 'Spring', 'Summer1', 'Summer10wk', or 'Summer2'",
      })
      .optional()
      .openapi({ param: { name: "quarter", in: "query" }, example: "Fall" }),
  })
  .refine((x) => Object.keys(x).length > 0, {
    message:
      "At least one filter must be provided. To get all LARC sections, use the /larc/all REST endpoint or allLarc GraphQL query.",
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
    year: z.string().openapi({ example: "2024" }),
    quarter: z.string().openapi({ example: "Fall" }),
  }),
});
