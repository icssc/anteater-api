import { z } from "@hono/zod-openapi";

export const instructorsPathSchema = z.object({
  ucinetid: z
    .string({ message: "Parameter 'ucinetid' is required" })
    .openapi({ param: { name: "ucinetid", in: "path" } }),
});

export const batchInstructorsQuerySchema = z.object({
  ucinetids: z
    .string({ message: "Parameter 'ucinetids' is required" })
    .transform((xs) => xs.split(","))
    .openapi({ example: "mikes,klefstad" }),
});

export const instructorsQuerySchema = z.object({
  nameContains: z
    .string()
    .optional()
    .openapi({ description: "A substring to search for in instructor names", example: "Shindler" }),
  titleContains: z
    .string()
    .optional()
    .openapi({ description: "A substring to search for in the title", example: "Associate" }),
  departmentContains: z
    .string()
    .optional()
    .openapi({
      description: "A substring to search for in the department name",
      example: "Science",
    }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({ description: "Number of results to return", example: 100 }),
  skip: z.coerce
    .number()
    .default(0)
    .openapi({ description: "Number of results to skip", example: 0 }),
});

export const instructorsByCursorQuerySchema = z.object({
  nameContains: z
    .string()
    .optional()
    .openapi({ description: "A substring to search for in instructor names", example: "Shindler" }),
  titleContains: z
    .string()
    .optional()
    .openapi({ description: "A substring to search for in the title", example: "Associate" }),
  departmentContains: z
    .string()
    .optional()
    .openapi({
      description: "A substring to search for in the department name",
      example: "Science",
    }),
  cursor: z
    .string()
    .optional()
    .openapi({
      description:
        "Pagination cursor based on instructor ucinetid. Use the `nextCursor` value from the previous response to fetch the next page",
    })
    .openapi({ example: "mikes" }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({ description: "Number of results to return", example: 100 }),
});

export const instructorPreviewSchema = z.object({
  ucinetid: z.string().openapi({ example: "mikes" }),
  name: z.string().openapi({ example: "Michael Shindler" }),
  title: z.string().openapi({ example: "Associate Professor of Teaching" }),
  email: z.string().email().or(z.literal("")).openapi({ example: "mikes@uci.edu" }),
  department: z.string().openapi({ example: "Computer Science" }),
  shortenedNames: z
    .string()
    .array()
    .openapi({ example: ["SHINDLER, M."] }),
});

export const coursePreviewWithTermsSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
  terms: z.string().array(),
});

export const instructorSchema = z.object({
  ucinetid: z.string().openapi({ example: "mikes" }),
  name: z.string().openapi({ example: "Michael Shindler" }),
  title: z.string().openapi({ example: "Associate Professor of Teaching" }),
  email: z.string().email().or(z.literal("")).openapi({ example: "mikes@uci.edu" }),
  department: z.string().openapi({ example: "Computer Science" }),
  shortenedNames: z
    .string()
    .array()
    .openapi({ example: ["SHINDLER, M."] }),
  courses: coursePreviewWithTermsSchema.array(),
});
