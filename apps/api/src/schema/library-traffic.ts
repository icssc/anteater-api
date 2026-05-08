import { z } from "@hono/zod-openapi";

const MAX_RANGE_DAYS: Record<string, number> = {
  hour: 14,
  day: 365,
  week: 730,
  month: 730,
};

export const libraryTrafficHistoryRawQuerySchema = z.object({
  locationId: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .openapi({ example: 245, description: "Filter results by Occuspace location ID" }),
  locationName: z.string().optional().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Filter results by name of this floor / section",
  }),
  libraryName: z.string().optional().openapi({
    example: "Langson Library",
    description: "Filter results by library name",
  }),
  year: z.string().optional().openapi({
    example: "2025",
    description: "Academic year — use with quarter to scope results to a term",
  }),
  quarter: z
    .enum(["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"])
    .optional()
    .openapi({
      example: "Winter",
      description: "Academic quarter — use with year to scope results to a term",
    }),
  period: z.enum(["instruction", "finals"]).default("instruction").openapi({
    description: "Which part of the term to filter to (only applies when year + quarter provided)",
    example: "instruction",
  }),
  startDate: z.coerce.date().optional().openapi({
    example: "2025-01-01",
    description: "Start of the time range (inclusive) — overridden by year/quarter if provided",
  }),
  endDate: z.coerce.date().optional().openapi({
    example: "2025-03-21",
    description: "End of the time range (inclusive) — overridden by year/quarter if provided",
  }),
  cursor: z.string().optional().openapi({
    description: "ISO timestamp cursor from previous response — returns rows after this point",
  }),
  take: z.coerce.number().int().positive().max(500).default(100).openapi({
    description: "Number of rows to return per page (max 500)",
    example: 100,
  }),
});

export const libraryTrafficHistoryRawEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 245 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.string().openapi({ example: "Langson Library" }),
  trafficCount: z.number().int().nonnegative().openapi({ example: 57 }),
  trafficPercentage: z.coerce.number().openapi({ example: 0.38 }),
  timestamp: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({ example: "2025-01-15T14:00:00.000Z" }),
});

export const libraryTrafficHistoryRawSchema = z.array(libraryTrafficHistoryRawEntrySchema);

export const libraryTrafficHistoryAggregatedQuerySchema = z
  .object({
    locationId: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ example: 245, description: "Filter results by Occuspace location ID" }),
    locationName: z.string().optional().openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    }),
    libraryName: z.string().optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name (averages across all locations in that library)",
    }),
    granularity: z.enum(["hour", "day", "week", "month"]).default("hour").openapi({
      description: "Time bucket size for averaging results",
      example: "hour",
    }),
    startDate: z.coerce.date().openapi({
      example: "2025-01-01",
      description: "Start of the time range (inclusive)",
    }),
    endDate: z.coerce.date().openapi({
      example: "2025-01-31",
      description:
        "End of the time range (inclusive). Max range: 14 days for hour, 365 days for day, 730 days for week/month.",
    }),
  })
  .refine(
    ({ granularity, startDate, endDate }) => {
      const cap = MAX_RANGE_DAYS[granularity];
      const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= cap;
    },
    { message: "Date range exceeds the maximum allowed for the selected granularity" },
  );

export const libraryTrafficHistoryAggregatedEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 245 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.string().openapi({ example: "Langson Library" }),
  period: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({
      example: "2025-01-15T14:00:00.000Z",
      description: "Start of the time bucket (ISO 8601)",
    }),
  avgCount: z.number().openapi({
    example: 42.5,
    description: "Average number of people detected during this period",
  }),
  avgPercentage: z.number().openapi({
    example: 0.28,
    description: "Average occupancy fraction during this period",
  }),
});

export const libraryTrafficHistoryAggregatedSchema = z.array(
  libraryTrafficHistoryAggregatedEntrySchema,
);

export const libraryTrafficHistoryPatternQuerySchema = z
  .object({
    locationId: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ example: 245, description: "Filter results by Occuspace location ID" }),
    locationName: z.string().optional().openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    }),
    libraryName: z.string().optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name",
    }),
    granularity: z.enum(["hour", "day", "week", "month"]).default("hour").openapi({
      description: "Cycle to group by — hour (0-23), day (Mon-Sun), week (1-53), month (Jan-Dec)",
      example: "hour",
    }),
    startDate: z.coerce.date().optional().openapi({
      example: "2025-01-01",
      description: "Start of the time range (inclusive)",
    }),
    endDate: z.coerce.date().optional().openapi({
      example: "2025-12-31",
      description: "End of the time range (inclusive). Max range: 730 days.",
    }),
  })
  .refine(
    ({ startDate, endDate }) => {
      if (startDate && endDate) {
        const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 730;
      }
      return true;
    },
    { message: "Date range must be between 0 and 730 days" },
  );

export const libraryTrafficHistoryPatternEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 245 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.string().openapi({ example: "Langson Library" }),
  bucket: z.number().int().openapi({
    example: 14,
    description: "Hour (0-23), ISO day of week (1=Mon-7=Sun), week of year (1-53), or month (1-12)",
  }),
  label: z.string().openapi({ example: "2pm", description: "Human-readable bucket label" }),
  avgCount: z.number().openapi({
    example: 87.3,
    description: "Average number of people detected during this bucket",
  }),
  avgPercentage: z.number().openapi({
    example: 0.58,
    description: "Average occupancy fraction during this bucket",
  }),
});

export const libraryTrafficHistoryPatternSchema = z.array(libraryTrafficHistoryPatternEntrySchema);

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
