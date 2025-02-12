import type {
  enrollmentChangeCourseSchema,
  enrollmentChangesQuerySchema,
  sectionStatusSchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq, getTableColumns, inArray } from "@packages/db/drizzle";
import { websocCourse, websocSection, websocSectionEnrollmentHistory } from "@packages/db/schema";
import type { z } from "zod";

type EnrollmentChangesServiceInput = z.infer<typeof enrollmentChangesQuerySchema>;

function buildQuery(input: EnrollmentChangesServiceInput) {
  return inArray(websocSection.sectionCode, input.sections);
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
    enrollments.sort((a, b) => a.scrapedAt.getTime() - b.scrapedAt.getTime());
    const latest = enrollments[enrollments.length - 1];
    const previous = enrollments.length > 1 ? enrollments[enrollments.length - 2] : undefined;

    const sectionChange = {
      sectionCode: section.sectionCode.toString(10).padStart(5, "0"),
      maxCapacity: latest.maxCapacity.toString(),
      status: {
        from: (previous?.status ?? "") as z.infer<typeof sectionStatusSchema>,
        to: (latest?.status ?? "") as z.infer<typeof sectionStatusSchema>,
      },
      numCurrentlyEnrolled: {
        totalEnrolled: latest.numCurrentlyTotalEnrolled?.toString() ?? "",
        sectionEnrolled: previous ? (previous.numCurrentlyTotalEnrolled?.toString() ?? "") : "",
      },
      numRequested: latest.numRequested?.toString() ?? "",
      numOnWaitlist: latest.numOnWaitlist?.toString() ?? "",
      numWaitlistCap: latest.numWaitlistCap?.toString() ?? "",
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

  const courses = Array.from(courseMap.values());

  const allDates = rows.map((row) => row.enrollment.scrapedAt.getTime());
  const updatedAt = new Date(Math.max(...allDates)).toISOString();

  return { courses, updatedAt };
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
      .orderBy(websocSectionEnrollmentHistory.scrapedAt);

    return transformEnrollmentChangeRows(rows);
  }
}
