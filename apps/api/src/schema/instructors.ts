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
  nameContains: z.string().optional(),
  titleContains: z.string().optional(),
  departmentContains: z.string().optional(),
  take: z.coerce.number().lte(100, "Page size must be less than or equal to 100").default(100),
  skip: z.coerce.number().default(0),
});

export const instructorsByCursorQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: "Pagination cursor from previous response. Omit for first page.",
    example: "eyJ1Y2luZXRpZCI6Im1pa2VzIn0=", // Base64 encoded: {"ucinetid":"mikes"}
  }),
  nameContains: z.string().optional(),
  titleContains: z.string().optional(),
  departmentContains: z.string().optional(),
  take: z.coerce.number().lte(100, "Page size must be less than or equal to 100").default(100),
});

export const coursePreviewWithTermsSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
  terms: z
    .string()
    .array()
    .openapi({
      example: ["2024 Spring"],
      description: "Academic terms when this instructor taught this course",
    }),
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

export const instructorsByCursorResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z.object({
      items: z.array(instructorSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .openapi({
    example: {
      ok: true,
      data: {
        items: [
          {
            ucinetid: "mikes",
            name: "Michael Shindler",
            title: "Associate Professor of Teaching",
            email: "mikes@uci.edu",
            department: "Computer Science",
            shortenedNames: ["SHINDLER, M."],
            courses: [
              {
                id: "COMPSCI161",
                title: "Design and Analysis of Algorithms",
                department: "COMPSCI",
                courseNumber: "161",
                terms: ["2024 Spring"],
              },
            ],
          },
        ],
        nextCursor: "eyJ1Y2luZXRpZCI6Im1pa2VzIn0=", // Base64 encoded: {"ucinetid":"mikes"}
      },
    },
    description: "Response containing paginated list of instructors with cursor-based navigation",
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
