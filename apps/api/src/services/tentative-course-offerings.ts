import type { database } from "@packages/db";
import { and, eq, inArray, sql } from "@packages/db/drizzle";
import { calendarTerm, tentativeCourseOffering, websocSchool } from "@packages/db/schema";
import type { z } from "zod";
import type { courseSchema } from "$schema";

const SUPPORTED_DEPARTMENTS = new Set(["COMPSCI", "CSE", "I&C SCI", "IN4MATX", "STATS"]);
const INCLUDED_QUARTERS = new Set(["Fall", "Winter", "Spring"]);

type CourseOutput = z.infer<typeof courseSchema>;
type CourseWithoutTentativeOfferings = Omit<CourseOutput, "tentativeOfferings">;
type TentativeOfferingOutput = NonNullable<CourseOutput["tentativeOfferings"]>[number];

export type TentativeOfferingEligibilityRow = {
  courseId: string;
  source: TentativeOfferingOutput["source"];
  academicYear: string;
  year: string;
  quarter: string;
  instructors: TentativeOfferingOutput["instructors"];
  updatedAt: Date;
  instructionStart: Date;
  isPublished: boolean;
};

function isWithinAcademicYear(row: TentativeOfferingEligibilityRow): boolean {
  const match = row.academicYear.match(/^(\d{4})-(\d{4})$/);
  if (!match) return false;
  const expectedYear = row.quarter === "Fall" ? match[1] : match[2];
  return row.year === expectedYear;
}

export function attachTentativeOfferings(
  courses: CourseWithoutTentativeOfferings[],
  rows: TentativeOfferingEligibilityRow[],
  now: Date,
): CourseOutput[] {
  const byCourseId = rows
    .filter(
      (row) =>
        INCLUDED_QUARTERS.has(row.quarter) &&
        isWithinAcademicYear(row) &&
        row.instructionStart.getTime() > now.getTime() &&
        !row.isPublished,
    )
    .toSorted(
      (a, b) =>
        a.instructionStart.getTime() - b.instructionStart.getTime() ||
        a.source.localeCompare(b.source),
    )
    .reduce((acc, row) => {
      const offering: TentativeOfferingOutput = {
        term: `${row.year} ${row.quarter}`,
        instructors: row.instructors,
        source: row.source,
        updatedAt: row.updatedAt.toISOString(),
      };
      acc.set(row.courseId, [...(acc.get(row.courseId) ?? []), offering]);
      return acc;
    }, new Map<string, TentativeOfferingOutput[]>());

  return courses.map((course) => ({
    ...course,
    tentativeOfferings: SUPPORTED_DEPARTMENTS.has(course.department)
      ? (byCourseId.get(course.id) ?? [])
      : null,
  }));
}

export async function enrichCoursesWithTentativeOfferings(
  db: ReturnType<typeof database>,
  courses: CourseWithoutTentativeOfferings[],
  now = new Date(),
): Promise<CourseOutput[]> {
  if (courses.length === 0) return [];

  const rows = await db
    .select({
      courseId: tentativeCourseOffering.courseId,
      source: tentativeCourseOffering.source,
      academicYear: tentativeCourseOffering.academicYear,
      year: tentativeCourseOffering.year,
      quarter: tentativeCourseOffering.quarter,
      instructors: tentativeCourseOffering.instructors,
      updatedAt: tentativeCourseOffering.updatedAt,
      instructionStart: calendarTerm.instructionStart,
      isPublished: sql<boolean>`EXISTS (
        SELECT 1
        FROM ${websocSchool}
        WHERE ${websocSchool.year} = ${tentativeCourseOffering.year}
          AND ${websocSchool.quarter} = ${tentativeCourseOffering.quarter}
      )`,
    })
    .from(tentativeCourseOffering)
    .innerJoin(
      calendarTerm,
      and(
        eq(calendarTerm.year, tentativeCourseOffering.year),
        eq(calendarTerm.quarter, tentativeCourseOffering.quarter),
      ),
    )
    .where(
      inArray(
        tentativeCourseOffering.courseId,
        courses.map(({ id }) => id),
      ),
    );

  return attachTentativeOfferings(courses, rows, now);
}
