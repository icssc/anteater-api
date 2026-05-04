import { z } from "@hono/zod-openapi";
import {
  materialRequirement,
  materialRequirements,
  materialTerms,
  textbookFormats,
} from "@packages/db/schema";
import { isBaseTenInt } from "@packages/stdlib";
import { courseNumberSchema, yearSchema } from "./lib";
import type { ParsedNumber, ParsedString } from "./websoc.ts";

export const courseMaterialsQuerySchema = z.object({
  year: yearSchema,
  quarter: z.enum(materialTerms, {
    error: (issue) =>
      issue.input === undefined ? "Parameter 'quarter' is required" : "Invalid parameter 'quarter'",
  }),
  department: z.string().optional().openapi({
    description: "Only include materials from courses offered by the specified department code",
    example: "I&C SCI",
  }),
  courseNumber: courseNumberSchema.optional().openapi({
    description: "Only include materials from courses with the specified course number",
  }),
  sectionCodes: z
    .string()
    .optional()
    .transform((codes, ctx) => {
      if (!codes) return undefined;
      const parsedNums: Exclude<ParsedNumber, ParsedString>[] = [];
      for (const code of codes.split(",").map((code) => code.trim())) {
        if (code.includes("-")) {
          const [lower, upper] = code.split("-");
          if (!(isBaseTenInt(lower) && isBaseTenInt(upper))) {
            ctx.issues.push({
              input: code,
              code: "custom",
              error: `'${code}' is not a valid section code range. A valid section code range consists of valid section codes, which are base-10 integers.`,
            });
            return z.NEVER;
          }
          parsedNums.push({
            _type: "ParsedRange",
            min: Number.parseInt(lower, 10),
            max: Number.parseInt(upper, 10),
          });
          continue;
        }
        if (!isBaseTenInt(code)) {
          ctx.issues.push({
            input: code,
            code: "custom",
            error: `'${code}' is not a valid section code. A valid section code is a base-10 integer.`,
          });
          return z.NEVER;
        }
        parsedNums.push({ _type: "ParsedInteger", value: Number.parseInt(code, 10) });
      }
      return parsedNums;
    })
    .openapi({
      description: "A comma-separated list of section codes or section code ranges",
      example: "36210,36216-36218",
    }),
  instructorName: z.string().optional().openapi({
    description:
      "Only include materials from courses taught by the specified instructor (case-insensitive, last name only)",
    example: "DILLENCOURT",
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

export const rawCourseMaterialsSchema = z.object({
  year: z.string(),
  quarter: z.enum(materialTerms),
  department: z.string(),
  courseNumber: z.number(),
  instructor: z.string(),
  isbn: z.string().nullable(),
  author: z.string().nullable(),
  title: z.string(),
  edition: z.string().nullable(),
  format: z.enum(textbookFormats),
  requirement: materialRequirement("requirement"),
  mmsId: z.string().nullable(),
  link: z.string().nullable(),
});
