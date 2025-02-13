import {
  type enrollmentChangeCourseSchema,
  type enrollmentChangesBodySchema,
  type enrollmentChangesQuerySchema,
  restrictionCodes,
  type sectionEnrollmentChangeEntry,
  type sectionStatusSchema,
} from "$schema";
import type { database } from "@packages/db";
import { and, desc, eq, getTableColumns, inArray, lte, or, sql } from "@packages/db/drizzle";
import { websocCourse, websocSection, websocSectionEnrollmentHistory } from "@packages/db/schema";
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
): z.infer<typeof sectionEnrollmentChangeEntry> {
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
    course: typeof websocCourse.$inferSelect;
    section: typeof websocSection.$inferSelect;
    enrollment: typeof websocSectionEnrollmentHistory.$inferSelect;
  }[],
) {
  const groupedBySection = new Map<
    string,
    {
      course: typeof websocCourse.$inferSelect;
      section: typeof websocSection.$inferSelect;
      enrollments: (typeof websocSectionEnrollmentHistory.$inferSelect)[];
    }
  >();

  for (const row of rows) {
    const key = row.section.id.toString();
    if (!groupedBySection.has(key)) {
      groupedBySection.set(key, {
        course: row.course,
        section: row.section,
        enrollments: [row.enrollment],
      });
    } else {
      const group = groupedBySection.get(key);
      if (group) {
        group.enrollments.push(row.enrollment);
      }
    }
  }

  const courseMap = new Map<string, z.infer<typeof enrollmentChangeCourseSchema>>();
  for (const { course, section, enrollments } of groupedBySection.values()) {
    const latest = enrollments[0];
    const previous = enrollments?.[1];

    const sectionChange = {
      sectionCode: section.sectionCode.toString(10).padStart(5, "0"),
      maxCapacity: latest.maxCapacity.toString(),
      from: previous ? transformEntry(previous) : undefined,
      to: transformEntry(latest),
    };

    const courseKey = course.id.toString();
    if (!courseMap.has(courseKey)) {
      courseMap.set(courseKey, {
        deptCode: course.deptCode,
        courseTitle: course.courseTitle,
        courseNumber: course.courseNumber,
        sections: [sectionChange],
      });
    } else {
      const courseEntry = courseMap.get(courseKey);
      if (courseEntry) {
        courseEntry.sections.push(sectionChange);
      }
    }
  }

  return { courses: Array.from(courseMap.values()) };
}

export class EnrollmentChangesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getEnrollmentChanges(
    params: EnrollmentChangesServiceInput,
    body: z.infer<typeof enrollmentChangesBodySchema>,
  ) {
    const queryConds = buildQuery(params, body);

    const ranked = this.db
      .select({
        enrollment: getTableColumns(websocSectionEnrollmentHistory),
        rnk: sql`RANK() OVER (PARTITION BY ${websocSectionEnrollmentHistory.sectionId} ORDER BY ${websocSectionEnrollmentHistory.scrapedAt} DESC)`.as(
          "rnk",
        ),
      })
      .from(websocSectionEnrollmentHistory)
      .innerJoin(websocSection, eq(websocSectionEnrollmentHistory.sectionId, websocSection.id))
      .where(queryConds)
      .as("ranked");

    const rows = await this.db
      .select({
        enrollment: ranked.enrollment,
        section: getTableColumns(websocSection),
        course: getTableColumns(websocCourse),
        isLatest: eq(ranked.rnk, 1),
      })
      .from(ranked)
      .innerJoin(websocSection, eq(ranked.enrollment.sectionId, websocSection.id))
      .innerJoin(websocCourse, eq(websocSection.courseId, websocCourse.id))
      .where(or(sql`rnk = 1`, and(sql`rnk > 1`, lte(ranked.enrollment.scrapedAt, params.since))))
      .orderBy(desc(ranked.rnk));

    return acculumateRows(rows);
  }
}
