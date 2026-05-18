import { z } from "@hono/zod-openapi";

const MAX_RANGE_DAYS: Record<string, number> = {
  hour: 14,
  day: 365,
  week: 730,
  month: 730,
};

export const libraryTrafficHistoryRawQuerySchema = z.object({
  libraryName: z.string().optional().openapi({
    example: "Langson Library",
    description: "Filter results by library name",
  }),
  locationName: z.string().optional().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Filter results by name of this floor / section",
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
    example: "2025-01-01T00:00:00Z",
    description: "Start of the time range (inclusive) — overridden by year/quarter if provided",
  }),
  endDate: z.coerce.date().optional().openapi({
    example: "2025-03-21T23:59:59Z",
    description: "End of the time range (inclusive) — overridden by year/quarter if provided",
  }),
  cursor: z.string().optional().openapi({
    description:
      "Pagination cursor (row id) from a previous response's nextCursor — returns rows after this point",
  }),
  take: z.coerce.number().int().positive().max(500).default(100).openapi({
    description: "Number of rows to return per page (max 500)",
    example: 100,
  }),
});

export const libraryTrafficHistoryRawEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 212 }),
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
    libraryName: z.string().optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name (returns one row per location in that library)",
    }),
    locationName: z.string().optional().openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    }),
    granularity: z.enum(["hour", "day", "week", "month"]).openapi({
      description: "Time bucket size for averaging results",
      example: "hour",
    }),
    year: z.string().optional().openapi({
      example: "2025",
      description:
        "Academic year — use with quarter to scope results to a term (overrides startDate/endDate)",
    }),
    quarter: z
      .enum(["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"])
      .optional()
      .openapi({
        example: "Winter",
        description:
          "Academic quarter — use with year to scope results to a term (overrides startDate/endDate)",
      }),
    period: z.enum(["instruction", "finals"]).default("instruction").openapi({
      description:
        "Which part of the term to filter to (only applies when year + quarter provided)",
      example: "instruction",
    }),
    startDate: z.coerce.date().openapi({
      example: "2025-01-01T00:00:00Z",
      description: "Start of the time range (inclusive) — overridden by year/quarter if provided",
    }),
    endDate: z.coerce.date().openapi({
      example: "2025-01-31T23:59:59Z",
      description:
        "End of the time range (inclusive) — overridden by year/quarter if provided. Max range: 14 days for hour, 365 days for day, 730 days for week/month.",
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
  locationId: z.number().int().openapi({ example: 212 }),
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
    libraryName: z.string().optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name",
    }),
    locationName: z.string().optional().openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    }),
    granularity: z.enum(["hour", "day", "week", "month"]).openapi({
      description: "Cycle to group by — hour (0-23), day (Mon-Sun), week (1-53), month (Jan-Dec)",
      example: "hour",
    }),
    year: z.string().optional().openapi({
      example: "2025",
      description: "Academic year — use with quarter to scope pattern to a term",
    }),
    quarter: z
      .enum(["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"])
      .optional()
      .openapi({
        example: "Winter",
        description: "Academic quarter — use with year to scope pattern to a term",
      }),
    period: z.enum(["instruction", "finals"]).default("instruction").openapi({
      description:
        "Which part of the term to filter to (only applies when year + quarter provided)",
      example: "instruction",
    }),
    startDate: z.coerce.date().optional().openapi({
      example: "2025-01-01T00:00:00Z",
      description: "Start of the time range (inclusive) — overridden by year/quarter if provided",
    }),
    endDate: z.coerce.date().optional().openapi({
      example: "2025-12-31T23:59:59Z",
      description: "End of the time range (inclusive) — overridden by year/quarter if provided",
    }),
  })
  .refine(
    ({ startDate, endDate }) => {
      if (startDate && endDate) {
        return endDate.getTime() >= startDate.getTime();
      }
      return true;
    },
    { message: "endDate must be on or after startDate" },
  );

export const libraryTrafficHistoryPatternEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 212 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.string().openapi({ example: "Langson Library" }),
  year: z.string().optional().openapi({
    example: "2025",
    description: "Academic year this bucket belongs to (week granularity only)",
  }),
  quarter: z.string().optional().openapi({
    example: "Fall",
    description: "Academic quarter this bucket belongs to (week granularity only)",
  }),
  bucket: z.number().int().openapi({
    example: 5,
    description: "Hour (0-23), ISO day of week (1=Mon-7=Sun), week of term (1-10), or month (1-12)",
  }),
  label: z.string().openapi({
    example: "2pm",
    description: "Human-readable bucket label (e.g. '2pm', 'Monday', 'Week 7', 'June')",
  }),
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
  id: z.number().int().nonnegative().openapi({ example: 212 }),
  libraryName: z.string().openapi({
    example: "Langson Library",
    description: "Name of the library which contains this location",
  }),
  locationName: z.string().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Name of this floor / section",
  }),
  locationId: z.number().int().openapi({ example: 212 }),
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
