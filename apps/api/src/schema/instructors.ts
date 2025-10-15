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
  nameContains: z.string().optional().openapi({
    description: "A substring to search for in instructor names (case-insensitive)",
    example: "Shindler",
  }),
  titleContains: z.string().optional().openapi({
    description: "A substring to search for in the instructor's title (case-insensitive)",
    example: "Associate",
  }),
  departmentContains: z.string().optional().openapi({
    description: "A substring to search for in the instructor's department name (case-insensitive)",
    example: "Science",
  }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({
      description:
        "Limits the number of results to return. Use with 'skip' for pagination: 'skip' specifies how many results to skip before returning 'take' results",
      example: 100,
    }),
  skip: z.coerce.number().default(0).openapi({
    description:
      "Skip this many results before beginning to return results. Use with 'take' for pagination: 'skip' specifies how many results to skip before returning 'take' results",
    example: 0,
  }),
});

export const instructorsByCursorQuerySchema = z.object({
  nameContains: z.string().optional().openapi({
    description: "A substring to search for in instructor names (case-insensitive)",
    example: "Shindler",
  }),
  titleContains: z.string().optional().openapi({
    description: "A substring to search for in the instructor's title (case-insensitive)",
    example: "Associate",
  }),
  departmentContains: z.string().optional().openapi({
    description: "A substring to search for in the instructor's department name (case-insensitive)",
    example: "Science",
  }),
  cursor: z
    .string()
    .optional()
    .openapi({
      description:
        "Pagination cursor based on professor UCInetID. Use the `nextCursor` value from previous response to fetch next page of results",
    })
    .openapi({ example: "mikes" }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({
      description:
        "Limits the number of results to return. Use with 'cursor' for cursor-based pagination",
      example: 100,
    }),
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
