import { z } from "@hono/zod-openapi";

export const libraryTrafficQuerySchema = z.object({
  libraryName: z
    .string()
    .openapi({
      example: "Langson Library",
      description: "Filter results by library name",
    })
    .optional(),
  locationName: z
    .string()
    .openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    })
    .optional(),
});

export const libraryTrafficEntrySchema = z.object({
  id: z.number().int().nonnegative().openapi({ example: 245 }),
  libraryName: z.string().openapi({
    example: "Langson Library",
    description: "Name of the library which contains this location",
  }),
  locationName: z.string().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Name of this floor / section",
  }),
  trafficCount: z.number().int().nonnegative().openapi({
    example: 57,
    description: "Number of people currently detected at the location",
  }),
  trafficPercentage: z.coerce.number().openapi({
    example: 0.33,
    description: "Occupancy as a fraction of stated capacity (0 to 1, or >1 if over-occupied)",
  }),
  timestamp: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({
      example: "2025-01-01T12:34:56.789Z",
      description: "When the library traffic was recorded (ISO 8601 timestamp)",
    }),
});

export const libraryTrafficSchema = z.array(libraryTrafficEntrySchema);
