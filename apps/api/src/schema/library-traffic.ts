import { z } from "@hono/zod-openapi";

export const libraryTrafficQuerySchema = z.object({
  location_name: z
    .string()
    .openapi({
      param: { name: "floor_name", in: "query" },
      example: "3rd Floor",
    })
    .optional(),
});

export const libraryTrafficSchema = z.object({
  id: z.string().openapi({ example: "245" }),
  location_name: z.string().openapi({ example: "3rd Floor" }),
  traffic_count: z.number().int().nonnegative().openapi({ example: 57 }),
  traffic_percentage: z.number().min(0).max(1).openapi({ example: 0.33 }),
  timestamp: z.string().openapi({
    example: "2025-01-01T12:34:56.789Z",
  }),
  is_active: z.boolean().openapi({ example: true }),
});
