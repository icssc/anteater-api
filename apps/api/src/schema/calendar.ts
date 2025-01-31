import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const calendarQuerySchema = z.object({
  year: yearSchema.openapi({ param: { name: "year", in: "query" } }),
  quarter: z
    .enum(terms, {
      message:
        "Parameter 'quarter' is required and must be one of 'Fall', 'Winter', 'Spring', 'Summer1', 'Summer10wk', or 'Summer2'",
    })
    .openapi({ param: { name: "quarter", in: "query" }, example: "Fall" }),
});

export const calendarTermSchema = z.object({
  year: z.string().openapi({ example: "2024" }),
  quarter: z.enum(terms).openapi({ example: "Fall" }),
  instructionStart: z.string().openapi({ example: "2024-09-26" }),
  instructionEnd: z.string().openapi({ example: "2024-12-06" }),
  finalsStart: z.string().openapi({ example: "2024-12-07" }),
  finalsEnd: z.string().openapi({ example: "2024-12-13" }),
  socAvailable: z.string().openapi({ example: "2024-05-04" }),
});
