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
import { websocSection, websocSectionEnrollmentHistory } from "@packages/db/schema";
import type { z } from "zod";

type EnrollmentChangesServiceInput = z.infer<typeof enrollmentChangesQuerySchema>;

function buildQuery(
  input: EnrollmentChangesServiceInput,
  body: z.infer<typeof enrollmentChangesBodySchema>,
) {
  return and(
    inArray(websocSection.sectionCode, body.sections),
    and(eq(websocSection.year, input.year), eq(websocSection.quarter, input.quarter)),
  );
}

function transformEntry(
  entry: typeof websocSectionEnrollmentHistory.$inferSelect,
): z.infer<typeof sectionEnrollmentSnapshot> {
  return {
    status: (entry?.status ?? "") as z.infer<typeof sectionStatusSchema>,
    maxCapacity: entry.maxCapacity.toString(),
    numWaitlistCap: entry.numWaitlistCap?.toString() ?? "",
    numOnWaitlist: entry.numOnWaitlist?.toString() ?? "",
    numCurrentlyEnrolled: {
      totalEnrolled: entry.numCurrentlyTotalEnrolled?.toString() ?? "",
      // sectionEnrolled: entry.sectionEnrolled?.toString() ?? "",
      sectionEnrolled: "",
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
    enrollment: typeof websocSectionEnrollmentHistory.$inferSelect;
  }[],
) {
  const groupedBySection = new Map<
    number,
    {
      sectionCode: typeof websocSection.$inferSelect.sectionCode;
      enrollments: (typeof websocSectionEnrollmentHistory.$inferSelect)[];
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

    const mapLatest = this.db
      .select({
        sectionId: websocSectionEnrollmentHistory.sectionId,
        latestScrape: max(websocSectionEnrollmentHistory.scrapedAt).as("latest_scrape"),
      })
      .from(websocSectionEnrollmentHistory)
      .groupBy(websocSectionEnrollmentHistory.sectionId)
      .as("map_latest");

    const sub = this.db
      .select({
        enrollment: getTableColumns(websocSectionEnrollmentHistory),
        sectionCode: websocSection.sectionCode,
        rn: sql`row_number() OVER (PARTITION BY ${websocSectionEnrollmentHistory.sectionId})`.as(
          "rn",
        ),
      })
      .from(websocSectionEnrollmentHistory)
      .leftJoin(
        mapLatest,
        and(
          eq(websocSectionEnrollmentHistory.sectionId, mapLatest.sectionId),
          or(
            eq(websocSectionEnrollmentHistory.scrapedAt, mapLatest.latestScrape),
            and(
              // for some reason, this doesn't typecheck otherwise
              gt(mapLatest.latestScrape, sql`${params.since.toISOString()}`),
              ne(websocSectionEnrollmentHistory.scrapedAt, mapLatest.latestScrape),
              lte(websocSectionEnrollmentHistory.scrapedAt, params.since),
            ),
          ),
        ),
      )
      .innerJoin(websocSection, eq(websocSectionEnrollmentHistory.sectionId, websocSection.id))
      .where(and(isNotNull(mapLatest.sectionId), queryConds))
      .orderBy(desc(websocSectionEnrollmentHistory.scrapedAt))
      .as("sub");

    const rows = await this.db
      .select({
        enrollment: sub.enrollment,
        sectionCode: sub.sectionCode,
      })
      .from(sub)
      .where(lte(sub.rn, 2));

    return acculumateRows(rows);
  }
}
