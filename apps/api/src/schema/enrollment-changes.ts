import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";
import { yearSchema } from "./lib";
import { numCurrentlyEnrolledSchema, restrictionCodes, sectionStatusSchema } from "./websoc.ts";

export const enrollmentChangesQuerySchema = z.object({
  year: yearSchema,
  quarter: z.enum(terms),
  since: z
    .string()
    .datetime({ offset: false })
    .transform((d) => new Date(d))
    .openapi({
      description: "The time which the `from` snapshot must describe; see route description.",
    }),
});

export const enrollmentChangesBodySchema = z.object({
  sections: z
    .array(z.number({ required_error: "The 'sections' body field is required." }))
    .min(1, { message: "The 'sections' array cannot be empty." })
    .max(5000)
    .openapi({
      description:
        "An array of section codes to request enrollment changes for. " +
        "Section codes not valid in the specified year and quarter are ignored.",
    }),
});

export const enrollmentChangesGraphQLQuerySchema = enrollmentChangesQuerySchema.merge(
  enrollmentChangesBodySchema,
);

export const sectionEnrollmentSnapshot = z.object({
  maxCapacity: z.string(),
  status: sectionStatusSchema,
  numCurrentlyEnrolled: numCurrentlyEnrolledSchema,
  numRequested: z.string(),
  numOnWaitlist: z.string(),
  numWaitlistCap: z.string(),
  restrictionCodes: z.array(z.enum(restrictionCodes)).openapi({
    description:
      "The restriction codes placed on this course (https://www.reg.uci.edu/enrollment/restrict_codes.html).",
  }),
  updatedAt: z
    .string()
    .datetime({
      local: true,
      offset: false,
    })
    .openapi({ description: "The time at which this enrollment snapshot was taken." }),
});

export const enrollmentChangeSectionSchema = z
  .object({
    sectionCode: z
      .string()
      .openapi({ description: "The section code depicted in the snapshots", example: "04546" }),
    from: sectionEnrollmentSnapshot.optional().openapi({
      description:
        "The latest enrollent snapshot not after `since` (see route description for caveats).",
    }),
    to: sectionEnrollmentSnapshot.openapi({
      description: "The latest enrollment snapshot for this section.",
    }),
  })
  .openapi({
    example: {
      sectionCode: "04546",
      from: {
        maxCapacity: "200",
        status: "OPEN",
        numCurrentlyEnrolled: {
          totalEnrolled: "198",
          sectionEnrolled: "198",
        },
        numRequested: "0",
        numOnWaitlist: "0",
        numWaitlistCap: "30",
        restrictionCodes: [],
        updatedAt: "2025-01-13T04:20:41.161Z",
      },
      to: {
        maxCapacity: "200",
        status: "Waitl",
        numCurrentlyEnrolled: {
          totalEnrolled: "200",
          sectionEnrolled: "200",
        },
        numRequested: "0",
        numOnWaitlist: "4",
        numWaitlistCap: "30",
        restrictionCodes: [],
        updatedAt: "2025-01-13T04:22:15.372Z",
      },
    },
  });

export const enrollmentChangesSchema = z.object({
  sections: z.array(enrollmentChangeSectionSchema),
});
