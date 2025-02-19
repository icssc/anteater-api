import { z } from "@hono/zod-openapi";

/**
 * Expects a string forming a four-digit positive integer
 */

export const yearSchema = z.coerce
  .string()
  .refine((val) => val !== ("" || "undefined" || "null"), {
    message: "Parameter 'year' is required",
  })
  .refine((val) => /^\d{4}$/.test(val), {
    message: "Year must be a 4-digit positive integer",
  })
  .openapi({
    description: "The academic year",
    examples: ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"],
    example: "2024",
  });
