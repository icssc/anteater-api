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
      example: "4th Floor – Nordstrom Honors Study Room",
      description: "Filter results by exact location name",
    })
    .optional(),
});

export const libraryTrafficEntrySchema = z.object({
  id: z.number().int().nonnegative().openapi({ example: 245 }),
  libraryName: z.string().openapi({
    example: "Langson Library",
    description: "Name of the library that owns this location",
  }),
  locationName: z.string().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Name of the floor / section inside the library",
  }),
  trafficCount: z.number().int().nonnegative().openapi({
    example: 57,
    description: "Number of people currently detected at the location",
  }),
  trafficPercentage: z.coerce
    .number()
    .transform((v) => Number(v))
    .openapi({
      example: 0.33,
      description: "Occupancy as a decimal percentage of total capacity (0 to 1)",
    }),
  timestamp: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({
      example: "2025-01-01T12:34:56.789Z",
      description: "When the library traffic was recorded (ISO timestamp)",
    }),
});

export const libraryTrafficSchema = z.array(libraryTrafficEntrySchema);
