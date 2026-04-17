import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const syllabiQuerySchema = z.object({
  courseId: z.string().openapi({
    description: "The course ID to retrieve syllabi for",
    example: "COMPSCI161",
  }),
  year: yearSchema.optional(),
  quarter: z.enum(terms, { error: (_issue) => "Invalid quarter provided" }).optional(),
  instructor: z.string().optional().openapi({
    description: "Only include syllabi for sections taught by the specified instructor",
    example: "SHINDLER, M.",
  }),
});

export const syllabiSchema = z.object({
  year: z.string().openapi({ example: "2025" }),
  quarter: z.enum(terms).openapi({ example: "Fall" }),
  url: z.string().openapi({
    example:
      "https://canvas.eee.uci.edu/courses/sis_course_id:CourseSpace-Section-F25-34190/assignments/syllabus",
  }),
});
