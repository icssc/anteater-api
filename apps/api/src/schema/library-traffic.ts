import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";

const libraryNames = ["Langson Library", "Science Library", "Gateway Study Center"] as const;
const granularities = ["hour", "day", "week", "month"] as const;

// Max span (in days) allowed for an explicit startDate/endDate range, per granularity —
// keeps fine-grained (e.g. hourly) queries from scanning unbounded history.
const MAX_RANGE_DAYS = {
  hour: 14,
  day: 365,
  week: 730,
  month: 730,
} as const;

const historyFilterBase = z.object({
  libraryName: z.enum(libraryNames).optional().openapi({
    example: "Langson Library",
    description: "Filter results by library name",
  }),
  locationName: z.string().optional().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Filter results by location name",
  }),
  year: z.string().optional().openapi({
    example: "2026",
    description: "Academic year of the term to scope results to",
  }),
  quarter: z.enum(terms).optional().openapi({
    example: "Fall",
    description:
      "Academic quarter of the term to scope to. Combined with year, restricts results to readings recorded during that term.",
  }),
  period: z.enum(["instruction", "finals"]).default("instruction").openapi({
    description:
      "When scoping by year + quarter, which part of the term to include — instruction weeks or finals week.",
  }),
  startDate: z.coerce.date().optional().openapi({
    example: "2026-01-01T00:00:00Z",
    description:
      "Start of the time range (inclusive). Combined with year/quarter when both are provided.",
  }),
  endDate: z.coerce.date().optional().openapi({
    example: "2026-01-31T23:59:59Z",
    description:
      "End of the time range (inclusive). Combined with year/quarter when both are provided.",
  }),
});

export const libraryTrafficHistoryRawQuerySchema = historyFilterBase.extend({
  cursor: z.string().optional().openapi({
    description:
      "Pagination cursor (row id) from a previous response's nextCursor — returns rows after this point",
  }),
  take: z.coerce.number().int().positive().max(500).default(100).openapi({
    description: "Number of rows to return per page (max 500)",
    example: 100,
  }),
});

const historyLocationBase = z.object({
  locationId: z.number().int().openapi({ example: 212 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.enum(libraryNames).openapi({ example: "Langson Library" }),
});

export const libraryTrafficHistoryRawEntrySchema = historyLocationBase.extend({
  trafficCount: z.number().int().nonnegative().openapi({ example: 57 }),
  trafficPercentage: z.number().openapi({ example: 0.38 }),
  timestamp: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({ example: "2026-01-15T22:00:00.000Z", description: "Timestamp (UTC, ISO 8601)" }),
});

export const libraryTrafficHistoryRawSchema = z.array(libraryTrafficHistoryRawEntrySchema);

export const libraryTrafficHistoryAggregatedQuerySchema = historyFilterBase
  .extend({
    granularity: z.enum(granularities).openapi({
      description: "Size of each time bucket that readings are averaged into",
    }),
    startDate: z.coerce.date().optional().openapi({
      example: "2026-01-01T00:00:00Z",
      description:
        "Start of the time range (inclusive). Required unless year + quarter are provided. Combined with year/quarter when both are provided.",
    }),
    endDate: z.coerce.date().optional().openapi({
      example: "2026-01-31T23:59:59Z",
      description:
        "End of the time range (inclusive). Required unless year + quarter are provided. Combined with year/quarter when both are provided. Max range: 14 days (hour), 365 days (day), 730 days (week/month).",
    }),
  })
  .refine(({ year, quarter, startDate, endDate }) => (year && quarter) || (startDate && endDate), {
    message: "Either (year + quarter) or (startDate + endDate) must be provided",
  })
  .refine(
    ({ granularity, startDate, endDate }) => {
      if (!startDate || !endDate) return true;
      const cap = MAX_RANGE_DAYS[granularity];
      const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= cap;
    },
    { message: "Date range exceeds the maximum allowed for the selected granularity" },
  );

export const libraryTrafficHistoryAggregatedEntrySchema = historyLocationBase.extend({
  bucketStart: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({
      example: "2026-01-15T22:00:00.000Z",
      description: "Start of the time bucket (UTC, ISO 8601)",
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

export const libraryTrafficHistoryPatternQuerySchema = historyFilterBase
  .extend({
    granularity: z.enum(granularities).openapi({
      description:
        "Recurring cycle to group readings by — hour-of-day (0-23), day-of-week (1=Mon...7=Sun), week-of-term (1-10; Fall 0-10), or month (1-12)",
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

export const libraryTrafficHistoryPatternEntrySchema = historyLocationBase.extend({
  year: z.string().optional().openapi({
    example: "2026",
    description:
      "Academic year for this bucket. Populated from term data when week granularity with quarter filter; otherwise echoes the year query param if provided.",
  }),
  quarter: z.string().optional().openapi({
    example: "Fall",
    description:
      "Academic quarter for this bucket. Populated from term data when week granularity with quarter filter; otherwise echoes the quarter query param if provided.",
  }),
  bucket: z.number().int().openapi({
    example: 14,
    description:
      "Position within the granularity's cycle (its meaning is set by the request's granularity): hour of day (0-23), ISO day of week (1=Mon-7=Sun), week of term (1-10; Fall 0-10), or month (1-12). See `label` for the human-readable form.",
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
    .enum(libraryNames)
    .openapi({
      example: "Langson Library",
      description: "Filter results by library name",
    })
    .optional(),
  locationName: z
    .string()
    .openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by location name",
    })
    .optional(),
});

export const libraryTrafficEntrySchema = z.object({
  id: z.number().int().nonnegative().openapi({ example: 212 }),
  libraryName: z.enum(libraryNames).openapi({
    example: "Langson Library",
    description: "Name of the library which contains this location",
  }),
  locationName: z.string().openapi({
    example: "4th Floor - Nordstrom Honors Study Room",
    description: "Name of this location",
  }),
  trafficCount: z.number().int().nonnegative().openapi({
    example: 57,
    description: "Number of people currently detected at the location",
  }),
  trafficPercentage: z.number().openapi({
    example: 0.33,
    description: "Occupancy as a fraction of stated capacity (0 to 1, or >1 if over-occupied)",
  }),
  timestamp: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .openapi({
      example: "2026-01-01T20:34:56.000Z",
      description: "When the library traffic was recorded (UTC, ISO 8601)",
    }),
});

export const libraryTrafficSchema = z.array(libraryTrafficEntrySchema);
