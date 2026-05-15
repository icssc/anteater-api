import type { database } from "@packages/db";
import { and, asc, avg, eq, gt, gte, lte, or, sql } from "@packages/db/drizzle";
import { calendarTerm, libraryTraffic, libraryTrafficHistory } from "@packages/db/schema";
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
    let startDate = input.startDate;
    let endDate = input.endDate;

    if (input.year && input.quarter) {
      const [term] = await this.db
        .select()
        .from(calendarTerm)
        .where(and(eq(calendarTerm.year, input.year), eq(calendarTerm.quarter, input.quarter)));
      if (!term) {
        throw new Error(`No calendar term found for ${input.year} ${input.quarter}`);
      }
      const isFinals = input.period === "finals";
      startDate = isFinals ? term.finalsStart : term.instructionStart;
      endDate = isFinals ? term.finalsEnd : term.instructionEnd;
    }

    const periodExpr = {
      hour: sql<Date>`date_trunc('hour', ${libraryTrafficHistory.timestamp})`,
      day: sql<Date>`date_trunc('day', ${libraryTrafficHistory.timestamp})`,
      week: sql<Date>`date_trunc('week', ${libraryTrafficHistory.timestamp})`,
      month: sql<Date>`date_trunc('month', ${libraryTrafficHistory.timestamp})`,
    }[input.granularity];

    const conds = [];

    if (input.locationName) {
      conds.push(eq(libraryTraffic.locationName, input.locationName));
    }

    if (input.libraryName) {
      conds.push(eq(libraryTraffic.libraryName, input.libraryName));
    }

    conds.push(gte(libraryTrafficHistory.timestamp, startDate));
    conds.push(lte(libraryTrafficHistory.timestamp, endDate));

    return this.db
      .select({
        locationId: libraryTrafficHistory.locationId,
        locationName: libraryTraffic.locationName,
        libraryName: libraryTraffic.libraryName,
        period: periodExpr,
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
        periodExpr,
      )
      .orderBy(asc(libraryTrafficHistory.locationId), asc(periodExpr));
  }

  async getLibraryTrafficHistoryPattern(input: LibraryTrafficHistoryPatternServiceInput) {
    let startDate = input.startDate;
    let endDate = input.endDate;

    if (input.year && input.quarter) {
      const [term] = await this.db
        .select()
        .from(calendarTerm)
        .where(and(eq(calendarTerm.year, input.year), eq(calendarTerm.quarter, input.quarter)));
      if (!term) {
        throw new Error(`No calendar term found for ${input.year} ${input.quarter}`);
      }
      const isFinals = input.period === "finals";
      startDate = isFinals ? term.finalsStart : term.instructionStart;
      endDate = isFinals ? term.finalsEnd : term.instructionEnd;
    }

    const bucketExpr = {
      hour: sql<number>`EXTRACT(hour FROM ${libraryTrafficHistory.timestamp})`,
      day: sql<number>`EXTRACT(isodow FROM ${libraryTrafficHistory.timestamp})`,
      week: sql<number>`EXTRACT(week FROM ${libraryTrafficHistory.timestamp})`,
      month: sql<number>`EXTRACT(month FROM ${libraryTrafficHistory.timestamp})`,
    }[input.granularity];

    const conds = [];

    if (input.locationName) {
      conds.push(eq(libraryTraffic.locationName, input.locationName));
    }

    if (input.libraryName) {
      conds.push(eq(libraryTraffic.libraryName, input.libraryName));
    }

    if (startDate) {
      conds.push(gte(libraryTrafficHistory.timestamp, startDate));
    }

    if (endDate) {
      conds.push(lte(libraryTrafficHistory.timestamp, endDate));
    }

    const rows = await this.db
      .select({
        locationId: libraryTrafficHistory.locationId,
        locationName: libraryTraffic.locationName,
        libraryName: libraryTraffic.libraryName,
        bucket: bucketExpr,
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
        bucketExpr,
      )
      .orderBy(asc(libraryTrafficHistory.locationId), asc(bucketExpr));

    return rows.map((row) => ({
      ...row,
      bucket: Number(row.bucket),
      label: patternLabel(input.granularity, Number(row.bucket)),
    }));
  }

  async getLibraryTrafficHistoryRaw(input: LibraryTrafficHistoryRawServiceInput) {
    let startDate = input.startDate;
    let endDate = input.endDate;

    if (input.year && input.quarter) {
      const [term] = await this.db
        .select()
        .from(calendarTerm)
        .where(and(eq(calendarTerm.year, input.year), eq(calendarTerm.quarter, input.quarter)));
      if (!term) {
        throw new Error(`No calendar term found for ${input.year} ${input.quarter}`);
      }
      const isFinals = input.period === "finals";
      startDate = isFinals ? term.finalsStart : term.instructionStart;
      endDate = isFinals ? term.finalsEnd : term.instructionEnd;
    }

    const conds = [];

    if (input.locationName) {
      conds.push(eq(libraryTraffic.locationName, input.locationName));
    }

    if (input.libraryName) {
      conds.push(eq(libraryTraffic.libraryName, input.libraryName));
    }

    if (startDate) {
      conds.push(gte(libraryTrafficHistory.timestamp, startDate));
    }

    if (endDate) {
      conds.push(lte(libraryTrafficHistory.timestamp, endDate));
    }

    if (input.cursor) {
      const [cursorRow] = await this.db
        .select({ timestamp: libraryTrafficHistory.timestamp })
        .from(libraryTrafficHistory)
        .where(eq(libraryTrafficHistory.id, input.cursor));
      if (!cursorRow) {
        throw new Error(`Invalid cursor: ${input.cursor}`);
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
