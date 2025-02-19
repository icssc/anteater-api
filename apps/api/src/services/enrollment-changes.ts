import {
  type coursePreviewSchema,
  type enrollmentChangeSectionSchema,
  type enrollmentChangesBodySchema,
  type enrollmentChangesQuerySchema,
  restrictionCodes,
  type sectionEnrollmentSnapshot,
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
import { websocCourse, websocSection, websocSectionEnrollmentLive } from "@packages/db/schema";
import { negativeAsNull } from "@packages/stdlib";
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
  // websoc transformSection
  return {
    status: entry.status ?? "",
    maxCapacity: entry.maxCapacity.toString(10),
    numCurrentlyEnrolled: {
      totalEnrolled: negativeAsNull(entry.numCurrentlyTotalEnrolled)?.toString(10) ?? "",
      sectionEnrolled: negativeAsNull(entry.numCurrentlySectionEnrolled)?.toString(10) ?? "",
    },
    numOnWaitlist: negativeAsNull(entry.numOnWaitlist)?.toString(10) ?? "",
    numRequested: entry.numRequested?.toString(10) ?? "",
    numWaitlistCap: negativeAsNull(entry.numWaitlistCap)?.toString(10) ?? "",
    numNewOnlyReserved: negativeAsNull(entry.numNewOnlyReserved)?.toString(10) ?? "",
    // safety: these codes are known to be valid columns
    restrictionCodes: restrictionCodes.filter(
      (c: string) => entry[`restriction_${c.toLowerCase()}` as keyof typeof entry],
    ),
    updatedAt: entry.scrapedAt.toISOString(),
  };
}

function accumulateRows(
  rows: {
    enrollment: typeof websocSectionEnrollmentLive.$inferSelect;
    sectionCode: typeof websocSection.$inferSelect.sectionCode;
    course: z.infer<typeof coursePreviewSchema>;
  }[],
) {
  type CourseSectionsMap = z.infer<typeof coursePreviewSchema> & {
    sections: Map<string, z.infer<typeof enrollmentChangeSectionSchema>>;
  };

  const groupedByCourse = new Map<string, CourseSectionsMap>();

  for (const row of rows) {
    const courseKey = row.course.id;
    if (!groupedByCourse.has(courseKey)) {
      groupedByCourse.set(courseKey, {
        ...row.course,
        sections: new Map(),
      });
    }
    const courseObj = groupedByCourse.get(courseKey);

    const sectionKey = row.sectionCode.toString(10).padStart(5, "0");
    if (!courseObj?.sections.has(sectionKey)) {
      courseObj?.sections.set(sectionKey, {
        sectionCode: sectionKey,
        to: transformEntry(row.enrollment),
      });
    } else {
      // safety: we know we have the key
      (courseObj.sections.get(sectionKey) as z.infer<typeof enrollmentChangeSectionSchema>).from =
        transformEntry(row.enrollment);
    }
  }

  return {
    courses: Array.from(
      groupedByCourse.values().map((v) => ({
        ...v,
        sections: Array.from(v.sections.values()),
      })),
    ),
  };
}

export class EnrollmentChangesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getEnrollmentChanges(
    params: EnrollmentChangesServiceInput,
    body: z.infer<typeof enrollmentChangesBodySchema>,
  ) {
    const queryConditions = buildQuery(params, body);

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
        course: {
          id: websocCourse.courseId,
          title: websocCourse.courseTitle,
          department: websocCourse.deptCode,
          courseNumber: websocCourse.courseNumber,
        },
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
      .innerJoin(websocCourse, eq(websocSection.courseId, websocCourse.id))
      .where(
        and(
          // we don't care about any snapshots not meeting the join condition (the join was a filter the whole time)
          isNotNull(mapLatest.sectionId),
          // also, we still have the conditions from the query itself
          queryConditions,
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
        course: sub.course,
      })
      .from(sub)
      .where(
        // we don't need snapshots older than "from"
        lte(sub.rn, 2),
      );

    return accumulateRows(rows);
  }
}
