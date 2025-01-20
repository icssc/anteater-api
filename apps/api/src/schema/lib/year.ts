import { z } from "@hono/zod-openapi";

/**
 * Confirms string for year is in valid format
 * Must be 4 characters
 * Could be String/Integer upon confirmation
 *
 * 1. Checks if it is a string
 * 2. Checks length of string is 4
 * 3. Checks if it is an integer
 *
 * Leaving a default openapi schema, if other schemas are adding to it, leave that separate.
 *
 */

export const yearSchema = z
  .string({ message: "Parameter 'year' is required" })
  .length(4, { message: "Parameter 'year' must have length 4" })
  .refine((x) => !Number.isNaN(Number.parseInt(x, 10)), {
    message: "Parameter 'year' must be an integer",
  })
  .openapi({ example: "2024" });
