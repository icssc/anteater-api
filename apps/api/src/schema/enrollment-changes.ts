import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";
import { yearSchema } from "./lib";
import { numCurrentlyEnrolledSchema, sectionStatusSchema } from "./websoc.ts";

export const enrollmentChangesQuerySchema = z.object({
  year: yearSchema,
  quarter: z.enum(terms),
  since: z
    .string()
    .datetime({ offset: false })
    .transform((d) => new Date(d)),
});

export const enrollmentChangesBodySchema = z.object({
  sections: z
    .array(z.number({ required_error: "The 'sections' body field is required." }))
    .min(1, { message: "The 'sections' array cannot be empty." }),
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
