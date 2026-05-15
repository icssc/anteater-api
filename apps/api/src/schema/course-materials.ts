import { z } from "@hono/zod-openapi";
import { materialRequirements, materialTerms, textbookFormats } from "@packages/db/schema";
import { courseNumberSchema, yearSchema } from "./lib";

export const courseMaterialsQuerySchema = z.object({
  year: yearSchema.optional(),
  quarter: z.enum(materialTerms, { error: (_issue) => "Invalid quarter provided" }).optional(),
  department: z.string().optional().openapi({
    description: "Only include materials from courses offered by the specified department code",
    example: "I&C SCI",
  }),
  courseNumber: courseNumberSchema.optional().openapi({
    description: "Only include materials from courses with the specified course number(s).",
  }),
  sectionCode: z
    .string()
    .regex(/^\d{5}$/, { error: "Invalid sectionCode provided" })
    .optional()
    .openapi({ description: "The 5-digit section code", example: "35630" }),
  instructor: z.string().optional().openapi({
    description:
      "Only include materials from courses taught by the specified instructor (case-insensitive)",
    example: "DILLENCOURT, M.",
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
  author: z.string().nullable().openapi({
    description: "The author of this course material.",
    example: "KLEINBERG",
  }),
  title: z.string().openapi({
    description: "The title of this course material.",
    example: "ALGORITHM DESIGN",
  }),
  edition: z
    .string()
    .nullable()
    .openapi({
      description: "The edition of this course material (formatting varies).",
      example: ["Third edition.", "14", "5TH 17"],
    }),
  format: z.enum(textbookFormats).openapi({
    description: "The format in which this course material is offered.",
  }),
  requirement: z.enum(materialRequirements).nullable().openapi({
    description: "The extent to which this course material is required for this particular course.",
  }),
  isbn: z.string().nullable().openapi({
    description: "The ISBN of this course material.",
    example: "9780062065254",
  }),
  mmsId: z.string().nullable().openapi({
    description:
      "The Metadata Management System ID of this course material, typically used to determine the material's URL.",
    example: "9780062065254",
  }),
  link: z.string().nullable().openapi({
    description:
      "The URL of this course material, typically located under https://uci.primo.exlibrisgroup.com.",
    example:
      "https://uci.primo.exlibrisgroup.com/permalink/01CDL_IRV_INST/17uq3m8/alma991014089349704701",
  }),
});
