import {
  type enrollmentChangeCourseSchema,
  type enrollmentChangesQuerySchema,
  restrictionCodes,
  type sectionEnrollmentChangeEntry,
  type sectionStatusSchema,
} from "$schema";
import type { database } from "@packages/db";
import { desc, eq, getTableColumns, inArray } from "@packages/db/drizzle";
import { websocCourse, websocSection, websocSectionEnrollmentHistory } from "@packages/db/schema";
import type { z } from "zod";

type EnrollmentChangesServiceInput = z.infer<typeof enrollmentChangesQuerySchema>;

function buildQuery(input: EnrollmentChangesServiceInput) {
  return inArray(websocSection.sectionCode, input.sections);
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

function transformEnrollmentChangeRows(
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
    const latest = enrollments[enrollments.length - 1];
    const previous = enrollments.length > 1 ? enrollments[enrollments.length - 2] : undefined;

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

  async getEnrollmentChanges(input: EnrollmentChangesServiceInput) {
    const rows = await this.db
      .select({
        course: getTableColumns(websocCourse),
        section: getTableColumns(websocSection),
        enrollment: getTableColumns(websocSectionEnrollmentHistory),
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
      .innerJoin(
        websocSectionEnrollmentHistory,
        eq(websocSection.id, websocSectionEnrollmentHistory.sectionId),
      )
      .where(buildQuery(input))
      .orderBy(
        desc(websocSectionEnrollmentHistory.scrapedAt),
        websocSectionEnrollmentHistory.sectionId,
      );

    return transformEnrollmentChangeRows(rows);
  }
}
