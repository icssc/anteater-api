import type { database } from "@packages/db";
import { and, asc, avg, eq, exists, gt, gte, lte, or, type SQL, sql } from "@packages/db/drizzle";
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
type HistoryFilterInput = Pick<
  LibraryTrafficHistoryRawServiceInput,
  "libraryName" | "locationName" | "year" | "quarter" | "period" | "startDate" | "endDate"
>;

// Readings are stored in UTC; buckets and term boundaries are evaluated in Pacific time
const localTs = sql`(${libraryTrafficHistory.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')`;
// Pacific calendar date of each reading — used for term-based date filters to avoid the
// UTC-midnight cutoff that would drop the last ~8h of data on the final day of a term.
const localDate = sql`${localTs}::date`;

// Location and explicit date range filters shared by all history endpoints
function historyFilterConds(input: HistoryFilterInput) {
  const conds: SQL[] = [];
  if (input.libraryName) conds.push(eq(libraryTraffic.libraryName, input.libraryName));
  if (input.locationName) conds.push(eq(libraryTraffic.locationName, input.locationName));
  if (input.startDate) conds.push(gte(libraryTrafficHistory.timestamp, input.startDate));
  if (input.endDate) conds.push(lte(libraryTrafficHistory.timestamp, input.endDate));
  return conds;
}

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

  // Restricts readings to the instruction or finals dates of the given term; explicit
  // startDate/endDate filters intersect with this when both are provided
  private async termDateConds(input: HistoryFilterInput) {
    if (!input.year || !input.quarter) return [];
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
    return [
      gte(
        localDate,
        sql`${toDateString(isFinals ? term.finalsStart : term.instructionStart)}::date`,
      ),
      lte(localDate, sql`${toDateString(isFinals ? term.finalsEnd : term.instructionEnd)}::date`),
    ];
  }

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
    // Truncate in Pacific time then convert back to UTC so the returned timestamp is a true UTC
    // moment aligned to the bucket boundary in Pacific time.
    const bucketStartExpr = {
      hour: sql<Date>`(date_trunc('hour', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      day: sql<Date>`(date_trunc('day', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      week: sql<Date>`(date_trunc('week', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
      month: sql<Date>`(date_trunc('month', ${localTs}) AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`,
    }[input.granularity];

    const conds = [...historyFilterConds(input), ...(await this.termDateConds(input))];

    return (
      this.db
        .select({
          locationId: libraryTraffic.id,
          locationName: libraryTraffic.locationName,
          libraryName: libraryTraffic.libraryName,
          bucketStart: bucketStartExpr,
          avgCount: avg(libraryTrafficHistory.trafficCount).mapWith(Number),
          avgPercentage: avg(libraryTrafficHistory.trafficPercentage).mapWith(Number),
        })
        .from(libraryTrafficHistory)
        .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id))
        .where(and(...conds))
        // Grouping by the location's primary key lets Postgres infer its name columns
        .groupBy(libraryTraffic.id, bucketStartExpr)
        .orderBy(asc(libraryTraffic.id), asc(bucketStartExpr))
    );
  }

  async getLibraryTrafficHistoryPattern(input: LibraryTrafficHistoryPatternServiceInput) {
    const isFinals = input.period === "finals";
    const periodStart = isFinals ? calendarTerm.finalsStart : calendarTerm.instructionStart;
    const periodEnd = isFinals ? calendarTerm.finalsEnd : calendarTerm.instructionEnd;
    const isWeek = input.granularity === "week";

    // Chosen in JS rather than bound as a parameter: bucketExpr is repeated in SELECT, GROUP BY
    // and ORDER BY, and Postgres treats differently-numbered parameters ($1, $2, ...) as distinct
    // expressions, which fails the GROUP BY check.
    const fallOffset = isFinals
      ? sql`0`
      : sql`CASE WHEN ${calendarTerm.quarter} = 'Fall' THEN 4 ELSE 0 END`;

    const bucketExpr = {
      hour: sql`EXTRACT(hour FROM ${localTs})`.mapWith(Number),
      day: sql`EXTRACT(isodow FROM ${localTs})`.mapWith(Number),
      // Same week-of-term logic as getWeek() in @packages/stdlib: Pacific calendar dates, 1-indexed,
      // with Fall's 4-day Thursday offset applied only during instruction so that Monday of the
      // first full week = week 1 and the Thu–Sun stub = week 0. Finals always start on a fixed
      // weekday so the offset is not applied there.
      week: sql`floor((${localDate} - ${periodStart} - ${fallOffset})::numeric / 7)::int + 1`.mapWith(
        Number,
      ),
      month: sql`EXTRACT(month FROM ${localTs})`.mapWith(Number),
    }[input.granularity];

    // Conditions on libraryTrafficHistory and libraryTraffic (used in both query paths)
    const localConds = historyFilterConds(input);
    // Reading falls within a term's instruction (or finals) dates, optionally a specific term
    const termConds = and(
      gte(localDate, periodStart),
      lte(localDate, periodEnd),
      input.year ? eq(calendarTerm.year, input.year) : undefined,
      input.quarter ? eq(calendarTerm.quarter, input.quarter) : undefined,
    );

    const query = this.db
      .select({
        locationId: libraryTraffic.id,
        locationName: libraryTraffic.locationName,
        libraryName: libraryTraffic.libraryName,
        bucket: bucketExpr,
        avgCount: avg(libraryTrafficHistory.trafficCount).mapWith(Number),
        avgPercentage: avg(libraryTrafficHistory.trafficPercentage).mapWith(Number),
      })
      .from(libraryTrafficHistory)
      .innerJoin(libraryTraffic, eq(libraryTrafficHistory.locationId, libraryTraffic.id));

    const rows = await (isWeek
      ? // Week-of-term numbering needs calendarTerm JOINed for periodStart and the Fall offset.
        // Exactly one term matches per row when quarter is provided; without quarter, summer
        // term overlap is a known edge case (specify quarter for accurate week data).
        query.innerJoin(calendarTerm, termConds).where(and(...localConds))
      : // Summer1/Summer10wk/Summer2 instruction periods overlap, so a JOIN would duplicate rows
        // for timestamps that fall in multiple terms and bias the averages. EXISTS avoids that.
        query.where(
          and(
            ...localConds,
            exists(this.db.select({ one: sql`1` }).from(calendarTerm).where(termConds)),
          ),
        )
    )
      // Grouping by the location's primary key lets Postgres infer its name columns
      .groupBy(libraryTraffic.id, bucketExpr)
      .orderBy(asc(libraryTraffic.id), asc(bucketExpr));

    return rows.map((row) => ({
      ...row,
      // Finals week buckets are relative to finalsStart, so "Week 1" would read as the first
      // week of instruction
      label: isWeek && isFinals ? "Finals Week" : patternLabel(input.granularity, row.bucket),
    }));
  }

  async getLibraryTrafficHistoryRaw(input: LibraryTrafficHistoryRawServiceInput) {
    const conds: (SQL | undefined)[] = [
      ...historyFilterConds(input),
      ...(await this.termDateConds(input)),
    ];

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
