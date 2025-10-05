import { z } from "@hono/zod-openapi";

/**
 * Expects a string forming a four-digit positive integer
 */

export const yearSchema = z.coerce
  .string()
  .refine((val: string) => val !== "" && val !== "null" && val !== "undefined", {
    message: "Parameter 'year' is required",
  })
  .refine((val: string) => /^\d{4}$/.test(val), {
    message: "Year must be a 4-digit positive integer",
  })
  .openapi({ example: "2024" });
