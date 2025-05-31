import { z } from "@hono/zod-openapi";

export const mapQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "The ID of a specific location request, if provided",
    example: "83021",
  }),
});

export const mapResponseSchema = z.array(
  z.object({
    id: z.string().openapi({
      description: "ID of this location",
      example: "83021",
    }),
    name: z.string().openapi({
      description: "The generic name of the location",
      example: "Art Studio (ART)",
    }),
    latitude: z.number().openapi({
      description: "The latitude of the selected location",
      example: 33.650162,
    }),
    longitude: z.number().openapi({
      description: "The longitude of the selected location",
      example: -117.844887,
    }),
  }),
);
