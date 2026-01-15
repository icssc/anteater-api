import { z } from "@hono/zod-openapi";

/**
 * Expects a string forming a four-digit positive integer
 */

export const yearSchema = z.coerce
  .string()
  .refine((val) => val !== "null" && val !== "undefined", {
    error: "Parameter 'year' is required",
  })
  .refine((val) => /^\d{4}$/.test(val), {
    error: "Year must be a 4-digit positive integer",
  })
  .openapi({ example: "2024" });
