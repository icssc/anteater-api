import type { database } from "@packages/db";
import { and, asc, avg, eq, exists, gt, gte, lte, or, sql } from "@packages/db/drizzle";
import { calendarTerm, libraryTraffic, libraryTrafficHistory } from "@packages/db/schema";
import { toDateString } from "@packages/db/utils";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type {
  libraryTrafficHistoryAggregatedQuerySchema,
  libraryTrafficHistoryPatternQuerySchema,
  libraryTrafficHistoryRawQuerySchema,
  libraryTrafficQuerySchema,
} from "$schema";

type LibraryTrafficServiceInput = z.infer<typeof libraryTrafficQuerySchema>;
type LibraryTrafficHistoryAggregatedServiceInput = z.infer<
  typeof libraryTrafficHistoryAggregatedQuerySchema
>;
type LibraryTrafficHistoryRawServiceInput = z.infer<typeof libraryTrafficHistoryRawQuerySchema>;
type LibraryTrafficHistoryPatternServiceInput = z.infer<
  typeof libraryTrafficHistoryPatternQuerySchema
>;

function patternLabel(granularity: string, bucket: number): string {
  if (granularity === "hour") {
    if (bucket === 0) return "12am";
    if (bucket < 12) return `${bucket}am`;
    if (bucket === 12) return "12pm";
    return `${bucket - 12}pm`;
  }
  if (granularity === "day") {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
      bucket - 1
    ];
  }
  if (granularity === "week") return `Week ${bucket}`;
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][bucket - 1];
}

export class LibraryTrafficService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  getLibraryTraffic(input: LibraryTrafficServiceInput) {
    const conds = [];

    if (input.libraryName) {
      conds.push(eq(libraryTraffic.libraryName, input.libraryName));
    }

    if (input.locationName) {
      conds.push(eq(libraryTraffic.locationName, input.locationName));
    }

    return this.db
      .select({
        id: libraryTraffic.id,
        libraryName: libraryTraffic.libraryName,
        locationName: libraryTraffic.locationName,
        trafficCount: libraryTraffic.trafficCount,
        trafficPercentage: libraryTraffic.trafficPercentage,
        timestamp: libraryTraffic.timestamp,
      })
      .from(libraryTraffic)
      .where(and(...conds));
  }

  async getLibraryTrafficHistoryAggregated(input: LibraryTrafficHistoryAggregatedServiceInput) {
    const localTs = sql`(${libraryTrafficHistory.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')`;
    // Pacific calendar date of each reading — used for term-based date filters to avoid the
    // UTC-midnight cutoff that would drop the last ~8h of data on the final day of a term.
    const localDate = sql`${localTs}::date`;
    // Truncate in Pacific time then convert back to UTC so the returned timestamp is a true UTC
    // moment aligned to the bucket boundary in Pacific time.
    const bucketStartExpr = {
      hour: sql<Date>`(date_trunc('hour', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      day: sql<Date>`(date_trunc('day', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      week: sql<Date>`(date_trunc('week', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      month: sql<Date>`(date_trunc('month', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
    }[input.granularity];

    const conds = [];

    if (input.locationName) conds.push(eq(libraryTraffic.locationName, input.locationName));
    if (input.libraryName) conds.push(eq(libraryTraffic.libraryName, input.libraryName));

    if (input.year && input.quarter) {
      const [term] = await this.db
        .select()
        .from(calendarTerm)
        .where(and(eq(calendarTerm.year, input.year), eq(calendarTerm.quarter, input.quarter)));
      if (!term) {
        throw new HTTPException(400, {
          message: `No calendar term found for ${input.year} ${input.quarter}`,
        });
      }
      const isFinals = input.period === "finals";
      conds.push(
        gte(
          localDate,
          sql`${toDateString(isFinals ? term.finalsStart : term.instructionStart)}::date`,
        ),
      );
      conds.push(
        lte(localDate, sql`${toDateString(isFinals ? term.finalsEnd : term.instructionEnd)}::date`),
      );
    }

    // Explicit date range intersects with the term filter when both are provided
    if (input.startDate) conds.push(gte(libraryTrafficHistory.timestamp, input.startDate));
    if (input.endDate) conds.push(lte(libraryTrafficHistory.timestamp, input.endDate));

    return this.db
      .select({
        locationId: libraryTrafficHistory.locationId,
        locationName: libraryTraffic.locationName,
        libraryName: libraryTraffic.libraryName,
        bucketStart: bucketStartExpr,
        avgCount: avg(libraryTrafficHistory.trafficCount).mapWith(Number),
        avgPercentage: avg(libraryTrafficHistory.trafficPercentage).mapWith(Number),
      })
      .from(libraryTrafficHistory)
      .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id))
      .where(and(...conds))
      .groupBy(
        libraryTrafficHistory.locationId,
        libraryTraffic.locationName,
        libraryTraffic.libraryName,
        bucketStartExpr,
      )
      .orderBy(asc(libraryTrafficHistory.locationId), asc(bucketStartExpr));
  }

  async getLibraryTrafficHistoryPattern(input: LibraryTrafficHistoryPatternServiceInput) {
    const isFinals = input.period === "finals";
    const periodStart = isFinals ? calendarTerm.finalsStart : calendarTerm.instructionStart;
    const periodEnd = isFinals ? calendarTerm.finalsEnd : calendarTerm.instructionEnd;
    const isWeek = input.granularity === "week";
    // Week bucket is term-relative (1-10), which only makes sense per-quarter; for other
    // granularities (hour-of-day, day-of-week, month) we always combine all terms
    const separateByTerm = isWeek && !!input.quarter;

    // Convert stored UTC timestamps to Pacific time before extracting hour/day/month buckets
    const localTs = sql`(${libraryTrafficHistory.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')`;

    const bucketExpr = {
      hour: sql`EXTRACT(hour FROM ${localTs})`.mapWith(Number),
      day: sql`EXTRACT(isodow FROM ${localTs})`.mapWith(Number),
      // Same week-of-term logic as getWeek() in week.ts: Pacific calendar dates, 1-indexed,
      // with Fall's 4-day Thursday offset applied only during instruction so that Monday of the
      // first full week = week 1 and the Thu–Sun stub = week 0. Finals always start on a fixed
      // weekday so the offset is not applied there.
      week: sql`floor(
        (${localTs}::date - ${periodStart}
         - CASE WHEN ${calendarTerm.quarter} = 'Fall' AND NOT ${isFinals} THEN 4 ELSE 0 END)::numeric / 7
      )::int + 1`.mapWith(Number),
      month: sql`EXTRACT(month FROM ${localTs})`.mapWith(Number),
    }[input.granularity];

    // Conditions on libraryTrafficHistory and libraryTraffic (used in both query paths)
    const localConds = [];
    if (input.locationName) localConds.push(eq(libraryTraffic.locationName, input.locationName));
    if (input.libraryName) localConds.push(eq(libraryTraffic.libraryName, input.libraryName));
    if (input.startDate) localConds.push(gte(libraryTrafficHistory.timestamp, input.startDate));
    if (input.endDate) localConds.push(lte(libraryTrafficHistory.timestamp, input.endDate));

    const groupBy = [
      libraryTrafficHistory.locationId,
      libraryTraffic.locationName,
      libraryTraffic.libraryName,
      bucketExpr,
    ] as const;

    const selectFields = {
      locationId: libraryTrafficHistory.locationId,
      locationName: libraryTraffic.locationName,
      libraryName: libraryTraffic.libraryName,
      year: separateByTerm ? calendarTerm.year : sql<string | null>`null`,
      quarter: separateByTerm ? calendarTerm.quarter : sql<string | null>`null`,
      bucket: bucketExpr,
      avgCount: avg(libraryTrafficHistory.trafficCount).mapWith(Number),
      avgPercentage: avg(libraryTrafficHistory.trafficPercentage).mapWith(Number),
    };

    let rows: {
      locationId: number;
      locationName: string | null;
      libraryName: string | null;
      year: string | null;
      quarter: string | null;
      bucket: number;
      avgCount: number;
      avgPercentage: number;
    }[];
    if (isWeek) {
      // Week-of-term numbering needs calendarTerm JOINed for periodStart and the Fall offset.
      // Exactly one term matches per row when quarter is provided; without quarter, summer
      // term overlap is a known edge case (specify quarter for accurate week data).
      const conds = [...localConds];
      if (input.year) conds.push(eq(calendarTerm.year, input.year));
      if (input.quarter) conds.push(eq(calendarTerm.quarter, input.quarter));

      const base = this.db
        .select(selectFields)
        .from(libraryTrafficHistory)
        .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id))
        .innerJoin(
          calendarTerm,
          and(gte(sql`${localTs}::date`, periodStart), lte(sql`${localTs}::date`, periodEnd)),
        )
        .where(and(...conds));

      rows = await (separateByTerm
        ? base
            .groupBy(...groupBy, calendarTerm.year, calendarTerm.quarter)
            .orderBy(
              asc(calendarTerm.year),
              asc(calendarTerm.quarter),
              asc(libraryTrafficHistory.locationId),
              asc(bucketExpr),
            )
        : base.groupBy(...groupBy).orderBy(asc(libraryTrafficHistory.locationId), asc(bucketExpr)));
    } else {
      // Summer1/Summer10wk/Summer2 instruction periods overlap, so a JOIN would duplicate rows
      // for timestamps that fall in multiple terms and bias the averages. EXISTS avoids that.
      const inTerm = exists(
        this.db
          .select({ one: sql`1` })
          .from(calendarTerm)
          .where(
            and(
              gte(sql`${localTs}::date`, periodStart),
              lte(sql`${localTs}::date`, periodEnd),
              input.year ? eq(calendarTerm.year, input.year) : undefined,
              input.quarter ? eq(calendarTerm.quarter, input.quarter) : undefined,
            ),
          ),
      );

      rows = await this.db
        .select(selectFields)
        .from(libraryTrafficHistory)
        .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id))
        .where(and(...localConds, inTerm))
        .groupBy(...groupBy)
        .orderBy(asc(libraryTrafficHistory.locationId), asc(bucketExpr));
    }

    return rows.map((row) => ({
      ...row,
      year: separateByTerm ? (row.year ?? undefined) : input.year,
      quarter: separateByTerm
        ? row.quarter != null
          ? String(row.quarter)
          : undefined
        : input.quarter,
      label: patternLabel(input.granularity, row.bucket),
    }));
  }

  async getLibraryTrafficHistoryRaw(input: LibraryTrafficHistoryRawServiceInput) {
    const localDate = sql`(${libraryTrafficHistory.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::date`;

    const conds = [];

    if (input.locationName) conds.push(eq(libraryTraffic.locationName, input.locationName));
    if (input.libraryName) conds.push(eq(libraryTraffic.libraryName, input.libraryName));

    if (input.year && input.quarter) {
      const [term] = await this.db
        .select()
        .from(calendarTerm)
        .where(and(eq(calendarTerm.year, input.year), eq(calendarTerm.quarter, input.quarter)));
      if (!term) {
        throw new HTTPException(400, {
          message: `No calendar term found for ${input.year} ${input.quarter}`,
        });
      }
      const isFinals = input.period === "finals";
      conds.push(
        gte(
          localDate,
          sql`${toDateString(isFinals ? term.finalsStart : term.instructionStart)}::date`,
        ),
      );
      conds.push(
        lte(localDate, sql`${toDateString(isFinals ? term.finalsEnd : term.instructionEnd)}::date`),
      );
    }

    if (input.startDate) conds.push(gte(libraryTrafficHistory.timestamp, input.startDate));
    if (input.endDate) conds.push(lte(libraryTrafficHistory.timestamp, input.endDate));

    if (input.cursor) {
      const [cursorRow] = await this.db
        .select({ timestamp: libraryTrafficHistory.timestamp })
        .from(libraryTrafficHistory)
        .where(eq(libraryTrafficHistory.id, input.cursor));
      if (!cursorRow) {
        throw new HTTPException(400, { message: `Invalid cursor: ${input.cursor}` });
      }
      conds.push(
        or(
          gt(libraryTrafficHistory.timestamp, cursorRow.timestamp),
          and(
            eq(libraryTrafficHistory.timestamp, cursorRow.timestamp),
            gt(libraryTrafficHistory.id, input.cursor),
          ),
        ),
      );
    }

    const rows = await this.db
      .select({
        id: libraryTrafficHistory.id,
        locationId: libraryTrafficHistory.locationId,
        locationName: libraryTraffic.locationName,
        libraryName: libraryTraffic.libraryName,
        trafficCount: libraryTrafficHistory.trafficCount,
        trafficPercentage: libraryTrafficHistory.trafficPercentage,
        timestamp: libraryTrafficHistory.timestamp,
      })
      .from(libraryTrafficHistory)
      .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id))
      .where(and(...conds))
      .orderBy(asc(libraryTrafficHistory.timestamp), asc(libraryTrafficHistory.id))
      .limit(input.take + 1);

    const items = rows.slice(0, input.take).map(({ id: _id, ...rest }) => rest);
    const nextCursor = rows.length > input.take ? rows[input.take - 1].id : null;

    return { items, nextCursor };
  }
}
