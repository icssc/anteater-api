import { z } from "@hono/zod-openapi";

export const libraryTrafficQuerySchema = z.object({
  locationName: z
    .string()
    .openapi({
      param: { name: "locationName", in: "query" },
    })
    .optional(),
});

export const libraryTrafficSchema = z.object({
  id: z.number().int().nonnegative().openapi({ example: 245 }),
  locationName: z.string().openapi({ example: "3rd Floor" }),
  trafficCount: z.number().int().nonnegative().openapi({ example: 57 }),
  trafficPercentage: z.number().min(0).max(1).openapi({ example: 0.33 }),
  timestamp: z.string().openapi({
    example: "2025-01-01T12:34:56.789Z",
  }),
});
