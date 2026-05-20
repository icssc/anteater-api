import { z } from "@hono/zod-openapi";
import { terms, websocSectionTypes, websocStatuses } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const enrollmentHistoryQuerySchema = z
  .object({
    year: yearSchema.optional(),
    quarter: z
      .enum(terms, {
        error: (issue) =>
          issue.value === undefined ? "quarter is required" : "Invalid quarter provided",
      })
      .optional(),
    instructorName: z.string().optional().openapi({
      description: "Only include courses taught by the specified instructor (case-insensitive)",
      example: "THORNTON, A.",
    }),
    department: z.string().optional().openapi({
      description: "Only include courses offered by the specified department code",
      example: "I&C SCI",
    }),
    courseNumber: z.string().optional().openapi({
      description: "Only include courses exactly matching the specified course number",
      example: "33",
    }),
    sectionCode: z
      .string()
      .regex(/^\d{5}$/, { error: "Invalid sectionCode provided" })
      .transform((x) => Number.parseInt(x, 10))
      .optional()
      .openapi({ description: "The 5-digit section code", example: "36120" }),
    sectionType: z
      .enum(websocSectionTypes, { error: (_issue) => "Invalid sectionType provided" })
      .optional(),
  })
  .refine(
    (x) =>
      (x.department && x.courseNumber) ||
      (x.sectionCode && x.year && x.quarter) ||
      (x.instructorName && x.courseNumber && x.year && x.quarter),
    {
      message:
        "Must provide department and course number; section code and year/quarter; or instructor name, course number, and year/quarter",
    },
  );

export const enrollmentHistorySchema = z.object({
  year: z.string(),
  quarter: z.enum(terms),
  sectionCode: z.string(),
  department: z.string(),
  courseNumber: z.string(),
  sectionType: z.enum(websocSectionTypes),
  sectionNum: z.string(),
  units: z.string(),
  instructors: z.string().array(),
  meetings: z.object({ bldg: z.string().array(), days: z.string(), time: z.string() }).array(),
  finalExam: z.string(),
  dates: z.string().array(),
  maxCapacityHistory: z.string().array(),
  totalEnrolledHistory: z.string().array(),
  waitlistHistory: z.string().array(),
  waitlistCapHistory: z.string().array(),
  requestedHistory: z.string().array(),
  newOnlyReservedHistory: z.string().array(),
  statusHistory: z.union([z.literal(""), z.enum(websocStatuses)]).array(),
});

export const enrollmentHistoryGranularQuerySchema = z
  .object({
    year: yearSchema.optional(),
    quarter: z
      .enum(terms, {
        error: (issue) =>
          issue.value === undefined ? "quarter is required" : "Invalid quarter provided",
      })
      .optional(),
    instructorName: z.string().optional().openapi({
      description: "Only include courses taught by the specified instructor (case-insensitive)",
      example: "THORNTON, A.",
    }),
    department: z.string().optional().openapi({
      description: "Only include courses offered by the specified department code",
      example: "I&C SCI",
    }),
    courseNumber: z.string().optional().openapi({
      description: "Only include courses exactly matching the specified course number",
      example: "33",
    }),
    sectionCode: z
      .string()
      .regex(/^\d{5}$/, { error: "Invalid sectionCode provided" })
      .transform((x) => Number.parseInt(x, 10))
      .optional()
      .openapi({ description: "The 5-digit section code", example: "36120" }),
    sectionType: z
      .enum(websocSectionTypes, { error: (_issue) => "Invalid sectionType provided" })
      .optional(),
    from: z.iso.datetime({ error: "Invalid from date provided" }).optional().openapi({
      description: "Start of the time range (ISO 8601 timestamp).",
      example: "2026-02-23T00:00:00.000Z",
    }),
    to: z.iso.datetime({ error: "Invalid to date provided" }).optional().openapi({
      description: "End of the time range (ISO 8601 timestamp).",
      example: "2026-03-13T00:00:00.000Z",
    }),
  })
  .refine(
    (x) =>
      (x.department && x.courseNumber) ||
      (x.sectionCode && x.year && x.quarter) ||
      (x.instructorName && x.courseNumber && x.year && x.quarter),
    {
      message:
        "Must provide department and course number; section code and year/quarter; or instructor name, course number, and year/quarter",
    },
  );

export const enrollmentHistoryGranularSchema = z.object({
  year: z.string(),
  quarter: z.enum(terms),
  sectionCode: z.string(),
  snapshots: z
    .object({
      timestamp: z.string(),
      maxCapacity: z.number(),
      totalEnrolled: z.number().nullable(),
      waitlist: z.number().nullable(),
      waitlistCap: z.number().nullable(),
      requested: z.number().nullable(),
      newOnlyReserved: z.number().nullable(),
      status: z.union([z.literal(""), z.enum(websocStatuses)]),
    })
    .array(),
});
