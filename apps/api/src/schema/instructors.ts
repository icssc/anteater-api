import { z } from "@hono/zod-openapi";

export const instructorsPathSchema = z.object({
  ucinetid: z
    .string({ message: "Parameter 'ucinetid' is required" })
    .openapi({ param: { name: "ucinetid", in: "path" } }),
});

export const batchInstructorsQuerySchema = z.object({
  ucinetids: z.string().transform((xs) => xs.split(",")),
});

export const instructorsQuerySchema = z.object({
  nameContains: z.string().optional(),
  titleContains: z.string().optional(),
  departmentContains: z.string().optional(),
  take: z.coerce
    .number()
    .default(100)
    .refine((x) => x <= 100, "Page size must be smaller than 100"),
  skip: z.coerce.number().default(0),
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
