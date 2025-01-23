import { z } from "@hono/zod-openapi";
import { terms, websocSectionTypes, websocStatuses } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const enrollmentHistoryQuerySchema = z
  .object({
    year: yearSchema.optional(),
    quarter: z.enum(terms, { invalid_type_error: "Invalid quarter provided" }).optional(),
    instructorName: z.string().optional(),
    department: z.string().optional(),
    courseNumber: z.string().optional(),
    sectionCode: z
      .string()
      .regex(/^\d{5}$/, { message: "Invalid sectionCode provided" })
      .transform((x) => Number.parseInt(x, 10))
      .optional(),
    sectionType: z
      .enum(websocSectionTypes, { invalid_type_error: "Invalid sectionType provided" })
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
