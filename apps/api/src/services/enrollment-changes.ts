import {
  type enrollmentChangesBodySchema,
  type enrollmentChangesQuerySchema,
  restrictionCodes,
  type sectionEnrollmentSnapshot,
  type sectionStatusSchema,
} from "$schema";
import type { database } from "@packages/db";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  lte,
  max,
  ne,
  or,
  sql,
} from "@packages/db/drizzle";
import { websocSection, websocSectionEnrollmentLive } from "@packages/db/schema";
import type { z } from "zod";

type EnrollmentChangesServiceInput = z.infer<typeof enrollmentChangesQuerySchema>;

function buildQuery(
  input: EnrollmentChangesServiceInput,
  body: z.infer<typeof enrollmentChangesBodySchema>,
) {
  return and(
    inArray(websocSection.sectionCode, body.sectionCodes),
    and(eq(websocSection.year, input.year), eq(websocSection.quarter, input.quarter)),
  );
}

function transformEntry(
  entry: typeof websocSectionEnrollmentLive.$inferSelect,
): z.infer<typeof sectionEnrollmentSnapshot> {
  return {
    status: (entry?.status ?? "") as z.infer<typeof sectionStatusSchema>,
    maxCapacity: entry.maxCapacity.toString(),
    numWaitlistCap: entry.numWaitlistCap?.toString() ?? "",
    numOnWaitlist: entry.numOnWaitlist?.toString() ?? "",
    numCurrentlyEnrolled: {
      totalEnrolled: entry.numCurrentlyTotalEnrolled?.toString() ?? "",
      sectionEnrolled: entry.numCurrentlySectionEnrolled?.toString() ?? "",
    },
    numRequested: entry.numRequested?.toString() ?? "",
    // safety: these codes are known to be valid columns
    restrictionCodes: restrictionCodes.filter(
      (c: string) => entry[`restriction_${c.toLowerCase()}` as keyof typeof entry],
    ),
    updatedAt: entry.scrapedAt.toISOString(),
  };
}

function acculumateRows(
  rows: {
    sectionCode: typeof websocSection.$inferSelect.sectionCode;
    enrollment: typeof websocSectionEnrollmentLive.$inferSelect;
  }[],
) {
  const groupedBySection = new Map<
    number,
    {
      sectionCode: typeof websocSection.$inferSelect.sectionCode;
      enrollments: (typeof websocSectionEnrollmentLive.$inferSelect)[];
    }
  >();

  for (const row of rows) {
    const key = row.sectionCode;
    if (!groupedBySection.has(key)) {
      groupedBySection.set(key, {
        sectionCode: key,
        enrollments: [row.enrollment],
      });
    } else {
      const group = groupedBySection.get(key);
      if (group) {
        group.enrollments.push(row.enrollment);
      }
    }
  }

  const sections = [];

  for (const { sectionCode, enrollments } of groupedBySection.values()) {
    const latest = enrollments[0];
    const previous = enrollments?.[1];

    sections.push({
      sectionCode: sectionCode.toString(10).padStart(5, "0"),
      from: previous ? transformEntry(previous) : undefined,
      to: transformEntry(latest),
    });
  }
  return { sections };
}

export class EnrollmentChangesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getEnrollmentChanges(
    params: EnrollmentChangesServiceInput,
    body: z.infer<typeof enrollmentChangesBodySchema>,
  ) {
    const queryConds = buildQuery(params, body);

    // what is the time on the latest snapshot of each section?
    const mapLatest = this.db
      .select({
        sectionId: websocSectionEnrollmentLive.sectionId,
        latestScrape: max(websocSectionEnrollmentLive.scrapedAt).as("latest_scrape"),
      })
      .from(websocSectionEnrollmentLive)
      .groupBy(websocSectionEnrollmentLive.sectionId)
      .as("map_latest");

    const sub = this.db
      .select({
        enrollment: getTableColumns(websocSectionEnrollmentLive),
        sectionCode: websocSection.sectionCode,
        rn: sql`row_number() OVER (PARTITION BY ${websocSectionEnrollmentLive.sectionId})`.as("rn"),
      })
      .from(websocSectionEnrollmentLive)
      // for all snapshots, the right side of the join will be present if:
      .leftJoin(
        mapLatest,
        and(
          // the right side must describe the same section (of course)...
          eq(websocSectionEnrollmentLive.sectionId, mapLatest.sectionId),
          or(
            // the left side must either be the latest snapshot...
            eq(websocSectionEnrollmentLive.scrapedAt, mapLatest.latestScrape),
            and(
              // or NOT the latest snapshot...
              ne(websocSectionEnrollmentLive.scrapedAt, mapLatest.latestScrape),
              // and the snapshot describing `since` is NOT the latest snapshot...
              // for some reason, this doesn't typecheck otherwise
              gt(mapLatest.latestScrape, sql`${params.since.toISOString()}`),
              // and is not after `since` (so it might describe `since`)
              lte(websocSectionEnrollmentLive.scrapedAt, params.since),
            ),
          ),
        ),
      )
      // after the first join, the snapshot rows with RHS present are either the latest snapshot for their section
      // or not after `since`, and these two sets are disjoint
      .innerJoin(websocSection, eq(websocSectionEnrollmentLive.sectionId, websocSection.id))
      .where(
        and(
          // we don't care about any snapshots not meeting the join condition (the join was a filter the whole time)
          isNotNull(mapLatest.sectionId),
          // also, we still have the conditions from the query itself
          queryConds,
        ),
      )
      .orderBy(
        // we're only interested in a "from" and "to" snapshot or, more precisely, a "to" snapshot and
        // a potential "from" snapshot...
        // let's make sure the "to" snapshot appears first, followed by the "from" snapshot, followed by others
        // this is cheap and effective
        desc(websocSectionEnrollmentLive.scrapedAt),
      )
      .as("sub");

    const rows = await this.db
      .select({
        enrollment: sub.enrollment,
        sectionCode: sub.sectionCode,
      })
      .from(sub)
      .where(
        // we don't need snapshots older than "from"
        lte(sub.rn, 2),
      );

    return acculumateRows(rows);
  }
}
