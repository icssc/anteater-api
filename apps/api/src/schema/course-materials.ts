import { z } from "@hono/zod-openapi";
import { materialRequirements, materialTerms, textbookFormats } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const courseMaterialsQuerySchema = z.object({
  year: yearSchema.optional(),
  quarter: z.enum(materialTerms, { error: (_issue) => "Invalid quarter provided" }).optional(),
  department: z.string().optional().openapi({
    description: "Only include materials from courses offered by the specified department code",
    example: "I&C SCI",
  }),
  courseNumber: z.string().optional().openapi({
    description: "Only include materials from courses exactly matching the specified course number",
    example: "45C",
  }),
  sectionCode: z
    .string()
    .regex(/^\d{5}$/, { error: "Invalid sectionCode provided" })
    .optional()
    .openapi({ description: "The 5-digit section code", example: "35630" }),
  instructor: z.string().optional().openapi({
    description:
      "Only include materials from courses taught by the specified instructor (case-insensitive)",
    example: "DILLENCOURT, M.B.",
  }),
  author: z.string().optional().openapi({
    description:
      "Only include materials from the specified author (case-insensitive, last name only)",
    example: "KLEINBERG",
  }),
  title: z.string().optional().openapi({
    description:
      "Only include materials whose title contains the specified string (case-insensitive)",
    example: "ALGORITHM DESIGN",
  }),
  format: z.enum(textbookFormats).optional(),
  requirement: z.enum(materialRequirements).optional(),
});

export const courseMaterialsSchema = z.object({
  year: z.string(),
  quarter: z.enum(materialTerms),
  sectionCode: z.string(),
  department: z.string(),
  courseNumber: z.string(),
  courseNumeric: z.number(),
  instructors: z.string().array(),
  author: z.string().nullable(),
  title: z.string(),
  edition: z.string().nullable(),
  format: z.enum(textbookFormats),
  requirement: z.enum(materialRequirements).nullable(),
  isbn: z.string().nullable(),
  mmsId: z.string().nullable(),
  link: z.string().nullable(),
});
