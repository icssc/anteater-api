import type { larcQuerySchema, larcResponseSchema, larcSectionSchema } from "$schema";
import type { database } from "@packages/db";
import { eq, getTableColumns, gte, ilike, lte } from "@packages/db/drizzle";
import { and } from "@packages/db/drizzle";
import { larcSection, websocCourse } from "@packages/db/schema";
import type { z } from "zod";
import { buildDaysOfWeekQuery, buildMultiCourseNumberQuery } from "./util.ts";

type LarcSessionServiceInput = z.infer<typeof larcQuerySchema>;

function buildQuery(input: LarcSessionServiceInput) {
  const conditions = [];

  if (input.year) {
    conditions.push(eq(websocCourse.year, input.year));
  }
  if (input.quarter) {
    conditions.push(eq(websocCourse.quarter, input.quarter));
  }
  if (input.department) {
    conditions.push(eq(websocCourse.deptCode, input.department));
  }
  conditions.push(...buildMultiCourseNumberQuery(input));
  if (input.instructorName) {
    conditions.push(ilike(larcSection.instructor, `${input.instructorName}%`));
  }
  if (input.building) {
    conditions.push(eq(larcSection.building, input.building.toUpperCase()));
  }
  conditions.push(...buildDaysOfWeekQuery(larcSection, input));
  if (input.startTime) {
    conditions.push(gte(larcSection.startTime, input.startTime));
  }
  if (input.endTime) {
    conditions.push(lte(larcSection.endTime, input.endTime));
  }
  return and(...conditions);
}

type Row = {
  course: typeof websocCourse.$inferSelect;
  section: typeof larcSection.$inferSelect;
};

const transformSection = (section: Row["section"]): z.infer<typeof larcSectionSchema> => ({
  meetings: [
    {
      bldg: [section.building],
      days: section.daysString,
      startTime: { hour: section.startTime.getHours(), minute: section.startTime.getMinutes() },
      endTime: { hour: section.endTime.getHours(), minute: section.endTime.getMinutes() },
    },
  ],
  instructors: [section.instructor],
});

function transformRows(rows: Row[]): z.infer<typeof larcResponseSchema> {
  const courses = rows
    .map((row) => row.course)
    .reduce(
      (acc, course) => acc.set(course.id, { ...course, sections: [] }),
      new Map<string, Row["course"] & { sections: Row["section"][] }>(),
    );

  const sections = rows.map((row) => row.section);

  for (const section of sections.values()) {
    courses.get(section.courseId)?.sections.push(section);
  }

  return {
    courses: courses
      .values()
      .toArray()
      .map((course) => ({
        deptCode: course.deptCode,
        courseTitle: course.courseTitle,
        courseNumber: course.courseNumber,
        sections: course.sections.map(transformSection),
      })),
  };
}

export class LarcService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getLarcSections(
    input: LarcSessionServiceInput,
  ): Promise<z.infer<typeof larcResponseSchema>> {
    const rows = await this.db
      .select({
        course: getTableColumns(websocCourse),
        section: getTableColumns(larcSection),
      })
      .from(larcSection)
      .innerJoin(websocCourse, eq(websocCourse.id, larcSection.courseId))
      .where(buildQuery(input));

    return transformRows(rows);
  }
}
