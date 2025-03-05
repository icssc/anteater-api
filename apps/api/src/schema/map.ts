import { z } from "@hono/zod-openapi";

export const mapQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "The ID of a specific location request, if provided",
    example: "8067",
  }),
});

export const mapResponseSchema = z.array(
  z.object({
    id: z.string().openapi({
      description: "ID of this location",
      example: "4563",
    }),
    name: z.string().openapi({
      description: "The generic name of the location",
      example: "Phoenix Food Court",
    }),
  }),
);
