import { z } from "zod";

export const rewardTypeSchema = z.object({
  degreeCode: z.string(),
  degreeShort: z.string(),
});

export const rewardTypesResponseSchema = rewardTypeSchema.array();

export const reportSchema = z.object({
  id: z.int(),
  school: z.object({
    schoolCode: z.string(),
  }),
  major: z.object({
    majorCode: z.string(),
    // one-letter term then two-digit year, if present
    endTermYyyyst: z.string().nullable(),
    // the "active" field is true even on majors whose end term has passed and therefore must be ignored
  }),
  degree: z.object({
    // teaching credentials, n-ple majors, undeclared, other misc do not have this
    // we will ignore these since they are certainly out of scope for degreeworks, but
    // it can happen at this stage
    degreeCode: z.string().nullable(),
  }),
});

export const reportsResponseSchema = reportSchema.array();
