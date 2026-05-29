import { z } from "@hono/zod-openapi";
import { terms } from "@packages/db/schema";

// Format a UTC Date as ISO 8601 with Pacific time offset (e.g. "2025-11-15T14:00:00-08:00").
// Handles PST/PDT automatically via IANA timezone data.
function toPacificISO(utcDate: Date): string {
  const la = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(utcDate);
  const localStr = la.replace(" ", "T");
  const offsetMin = (Date.parse(`${localStr}Z`) - utcDate.getTime()) / 60000;
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${localStr}${offset}`;
}

const libraryNames = ["Langson Library", "Science Library", "Gateway Study Center"] as const;

const MAX_RANGE_DAYS: Record<string, number> = {
  hour: 14,
  day: 365,
  week: 730,
  month: 730,
};

export const libraryTrafficHistoryRawQuerySchema = z.object({
  libraryName: z.enum(libraryNames).optional().openapi({
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
  quarter: z.enum(terms).optional().openapi({
    example: "Winter",
    description: "Academic quarter — use with year to scope results to a term",
  }),
  period: z.enum(["instruction", "finals"]).default("instruction").openapi({
    description: "Which part of the term to filter to (only applies when year + quarter provided)",
    example: "instruction",
  }),
  startDate: z.coerce.date().optional().openapi({
    example: "2025-01-01T00:00:00Z",
    description:
      "Start of the time range (inclusive). Combined with year/quarter when both are provided.",
  }),
  endDate: z.coerce.date().optional().openapi({
    example: "2025-03-21T23:59:59Z",
    description:
      "End of the time range (inclusive). Combined with year/quarter when both are provided.",
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
  libraryName: z.enum(libraryNames).openapi({ example: "Langson Library" }),
  trafficCount: z.number().int().nonnegative().openapi({ example: 57 }),
  trafficPercentage: z.number().openapi({ example: 0.38 }),
  timestamp: z.coerce
    .date()
    .transform(toPacificISO)
    .openapi({ example: "2025-01-15T14:00:00-08:00" }),
});

export const libraryTrafficHistoryRawSchema = z.array(libraryTrafficHistoryRawEntrySchema);

export const libraryTrafficHistoryAggregatedQuerySchema = z
  .object({
    libraryName: z.enum(libraryNames).optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name",
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
        "Academic year — use with quarter to scope results to a term (alternative to startDate/endDate)",
    }),
    quarter: z.enum(terms).optional().openapi({
      example: "Winter",
      description:
        "Academic quarter — use with year to scope results to a term (alternative to startDate/endDate)",
    }),
    period: z.enum(["instruction", "finals"]).default("instruction").openapi({
      description:
        "Which part of the term to filter to (only applies when year + quarter provided)",
      example: "instruction",
    }),
    startDate: z.coerce.date().optional().openapi({
      example: "2025-01-01T00:00:00Z",
      description:
        "Start of the time range (inclusive). Required unless year + quarter are provided. Combined with year/quarter when both are provided.",
    }),
    endDate: z.coerce.date().optional().openapi({
      example: "2025-01-31T23:59:59Z",
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

export const libraryTrafficHistoryAggregatedEntrySchema = z.object({
  locationId: z.number().int().openapi({ example: 212 }),
  locationName: z.string().openapi({ example: "4th Floor - Nordstrom Honors Study Room" }),
  libraryName: z.enum(libraryNames).openapi({ example: "Langson Library" }),
  bucketStart: z.coerce.date().transform(toPacificISO).openapi({
    example: "2025-01-15T14:00:00-08:00",
    description: "Start of the time bucket (ISO 8601, Pacific time)",
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
    libraryName: z.enum(libraryNames).optional().openapi({
      example: "Langson Library",
      description: "Filter results by library name",
    }),
    locationName: z.string().optional().openapi({
      example: "4th Floor - Nordstrom Honors Study Room",
      description: "Filter results by name of this floor / section",
    }),
    granularity: z.enum(["hour", "day", "week", "month"]).openapi({
      description:
        "Cycle to group by — hour-of-day (0-23), day-of-week (1=Mon...7=Sun), week-of-term (1-10), or month (1-12)",
      example: "hour",
    }),
    year: z.string().optional().openapi({
      example: "2025",
      description: "Academic year — use with quarter to scope results to a term",
    }),
    quarter: z.enum(terms).optional().openapi({
      example: "Winter",
      description: "Academic quarter — use with year to scope results to a term",
    }),
    period: z.enum(["instruction", "finals"]).default("instruction").openapi({
      description: "Which part of the term to filter to",
      example: "instruction",
    }),
    startDate: z.coerce.date().optional().openapi({
      example: "2025-01-01T00:00:00Z",
      description:
        "Start of the time range (inclusive). Combined with year/quarter when both are provided.",
    }),
    endDate: z.coerce.date().optional().openapi({
      example: "2025-12-31T23:59:59Z",
      description:
        "End of the time range (inclusive). Combined with year/quarter when both are provided.",
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
  libraryName: z.enum(libraryNames).openapi({ example: "Langson Library" }),
  year: z.string().optional().openapi({
    example: "2025",
    description:
      "Academic year for this bucket. Populated from term data when week granularity with quarter filter; otherwise echoes the year query param if provided.",
  }),
  quarter: z.string().optional().openapi({
    example: "Fall",
    description:
      "Academic quarter for this bucket. Populated from term data when week granularity with quarter filter; otherwise echoes the quarter query param if provided.",
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
      description: "Filter results by name of this floor / section",
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
    description: "Name of this floor / section",
  }),
  trafficCount: z.number().int().nonnegative().openapi({
    example: 57,
    description: "Number of people currently detected at the location",
  }),
  trafficPercentage: z.number().openapi({
    example: 0.33,
    description: "Occupancy as a fraction of stated capacity (0 to 1, or >1 if over-occupied)",
  }),
  timestamp: z.coerce.date().transform(toPacificISO).openapi({
    example: "2025-01-01T12:34:56-08:00",
    description: "When the library traffic was recorded (ISO 8601, Pacific time)",
  }),
});

export const libraryTrafficSchema = z.array(libraryTrafficEntrySchema);
