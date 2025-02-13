import { z } from "@hono/zod-openapi";
import { baseTenIntOrNull, negativeAsNull } from "@packages/stdlib";
import { numCurrentlyEnrolledSchema, sectionStatusSchema } from "./websoc.ts";

export const enrollmentChangesQuerySchema = z.object({
  sections: z
    .string({ required_error: "The 'sections' query parameter is required." })
    .min(1, { message: "The 'sections' query parameter cannot be empty." })
    .transform((sections) =>
      sections.split(",").map((code) => negativeAsNull(baseTenIntOrNull(code.trim()))),
    )
    .refine(
      (sections) => sections.every((s) => s !== null),
      "All comma-separated section codes must be non-negative integers",
    ),
});

export const sectionEnrollmentChangeEntry = z.object({
  maxCapacity: z.string(),
  status: sectionStatusSchema,
  numCurrentlyEnrolled: numCurrentlyEnrolledSchema,
  numRequested: z.string(),
  numOnWaitlist: z.string(),
  numWaitlistCap: z.string(),
  restrictionCodes: z.array(z.string()).optional(),
  updatedAt: z.string().datetime({ local: true, offset: false }),
});

export const enrollmentChangeSectionSchema = z.object({
  sectionCode: z.string(),
  from: sectionEnrollmentChangeEntry.optional(),
  to: sectionEnrollmentChangeEntry,
});

export const enrollmentChangeCourseSchema = z.object({
  deptCode: z.string(),
  courseTitle: z.string(),
  courseNumber: z.string(),
  sections: z.array(enrollmentChangeSectionSchema),
});

export const enrollmentChangesSchema = z.object({
  courses: z.array(enrollmentChangeCourseSchema),
});
