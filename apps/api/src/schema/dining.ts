import { z } from "@hono/zod-openapi";

export const diningEventQuerySchema = z.object({
  restaurantId: z.string().optional().openapi({
    example: "3056",
    description: "Filter events by restaurant ID",
  }),
});

export const eventSchema = z.object({
  title: z.string().openapi({ example: "Lunar New Year Celebration" }),
  image: z.string().nullable().openapi({ example: "https://images.elevate-dxp.com/..." }),
  restaurantId: z.string().openapi({ example: "3056" }),
  longDescription: z.string().nullable(),
  // transforms Date objects in db to ISO 8601 strings (I hope)
  start: z.coerce
    .date()
    .nullable()
    .transform((d) => d?.toISOString() ?? null),
  end: z.coerce
    .date()
    .nullable()
    .transform((d) => d?.toISOString() ?? null),
});

export const diningEventsResponseSchema = z.array(eventSchema);

export type DiningEventsResponse = z.infer<typeof diningEventsResponseSchema>;
