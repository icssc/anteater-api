import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";
import { courseNumberTransform } from "./lib/course-utils.ts";
import { daysTransform } from "./lib/day-utils.ts";
import { timeSchema } from "./lib/time-utils.ts";

export const larcQuerySchema = z.object({
  instructorName: z
    .string()
    .optional()
    .openapi({ description: "The instructor of the LARC section", example: "Peter Anteater" }),
  building: z
    .string()
    .optional()
    .openapi({ description: "The building of the LARC section", example: "ALP 3700" }),
  department: z.string().optional().openapi({
    description: "The department of the LARC section's related course",
    example: "I&C SCI",
  }),
  courseNumber: z.string().optional().transform(courseNumberTransform).openapi({
    description: "The course number(s) of the LARC section's related course.",
    example: "46,6B,51-53",
  }),
  year: z
    .string({ message: "Parameter 'year' is required " })
    .regex(/^\d{4}$/, { message: "Invalid year provided" })
    .openapi({ description: "The year of the LARC section", example: "2024" }),
  quarter: z
    .enum(terms, {
      message:
        "Parameter 'quarter' is required and must be one of 'Fall', 'Winter', 'Spring', 'Summer1', 'Summer10wk', or 'Summer2'",
    })
    .openapi({ description: "The quarter of the LARC section", example: "Fall" }),
  days: z
    .string()
    .transform(daysTransform)
    .optional()
    .openapi({
      example: "M,Tu,W,Th,F",
    })
    .openapi({ description: "Selects LARC sections held on any of the given days" }),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

const hourMinuteSchema = z.object({
  hour: z.number().openapi({ example: 11 }),
  minute: z.number().openapi({ example: 50 }),
});

export const larcSectionSchema = z.object({
  meetings: z.array(
    z.object({
      bldg: z.string().openapi({ example: "ALP 3700" }).array(),
      days: z.string().openapi({ example: "MWF" }),
      startTime: hourMinuteSchema.or(z.null()),
      endTime: hourMinuteSchema.or(z.null()),
    }),
  ),
  instructors: z.array(z.string().openapi({ example: "Peter Anteater" })),
});

const websocCourseLarcSchema = z.object({
  deptCode: z.string().openapi({ example: "I&C SCI" }),
  courseTitle: z.string().openapi({ example: "DATA STRC IMPL&ANLS" }),
  courseNumber: z.string().openapi({ example: "46" }),
  sections: larcSectionSchema.array(),
});

export const larcResponseSchema = z.object({
  courses: websocCourseLarcSchema.array(),
});
