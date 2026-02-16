import { z } from "@hono/zod-openapi";

export const takeBaseSchema = z.coerce
  .number()
  .lte(100, "Page size must be less than or equal to 100")
  .default(100) as const;

export const skipBaseSchema = z.coerce.number().default(0) as const;

export const cursorBaseSchema = z.string().optional();
