import type { coursePreviewSchema, instructorSchema, instructorsQuerySchema } from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import { and, eq, ilike, inArray, ne, sql } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import {
  course,
  instructor,
  instructorToWebsocInstructor,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";

type InstructorServiceInput = z.infer<typeof instructorsQuerySchema>;

function buildQuery(input: InstructorServiceInput) {
  const conditions = [ne(instructor.ucinetid, "student")];
  if (input.nameContains) {
    conditions.push(ilike(instructor.name, `%${input.nameContains}%`));
  }
  if (input.titleContains) {
    conditions.push(ilike(instructor.title, `%${input.titleContains}%`));
  }
  if (input.departmentContains) {
    conditions.push(ilike(instructor.department, `%${input.departmentContains}%`));
  }
  return and(...conditions);
}

type InstructorMetaRow = {
  shortenedName: string;
  term: { year: string; quarter: Term };
  course: z.infer<typeof coursePreviewSchema>;
};

function transformMetaRows(rows: InstructorMetaRow[]) {
  const shortenedNames = new Set<string>();
  const courses = new Map<string, InstructorMetaRow["course"] & { terms: Set<string> }>();
  for (const { shortenedName, term, course } of rows) {
    const termString = `${term.year} ${term.quarter}`;
    shortenedNames.add(shortenedName);
    courses.set(course.id, {
      ...course,
      terms: courses.get(course.id)?.terms.add(termString) ?? new Set([termString]),
    });
  }
  return {
    shortenedNames: Array.from(shortenedNames),
    courses: Array.from(courses.values()).map(({ terms, ...rest }) => ({
      ...rest,
      terms: Array.from(terms),
    })),
  };
}

export class InstructorsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getInstructorsRaw(input: {
    where?: SQL;
    offset?: number;
    limit?: number;
  }): Promise<z.infer<typeof instructorSchema>[]> {
    const { where, offset, limit } = input;
    const rows = await this.db
      .select()
      .from(instructor)
      .where(where)
      .offset(offset ?? 0)
      .limit(limit ?? 1)
      .orderBy(instructor.ucinetid)
      .then((rows) =>
        rows.reduce(
          (acc, row) => acc.set(row.ucinetid, row),
          new Map<string, typeof instructor.$inferSelect>(),
        ),
      );
    if (!rows.size) return [];
    const metaRows = await this.db
      .select({
        ucinetid: instructorToWebsocInstructor.instructorUcinetid,
        shortenedName: instructorToWebsocInstructor.websocInstructorName,
        term: { year: websocCourse.year, quarter: websocCourse.quarter },
        course: {
          id: course.id,
          title: course.title,
          department: course.department,
          courseNumber: course.courseNumber,
        },
      })
      .from(instructor)
      .innerJoin(
        instructorToWebsocInstructor,
        eq(instructorToWebsocInstructor.instructorUcinetid, instructor.ucinetid),
      )
      .innerJoin(
        websocInstructor,
        eq(websocInstructor.name, instructorToWebsocInstructor.websocInstructorName),
      )
      .innerJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.instructorName, websocInstructor.name),
      )
      .innerJoin(websocSection, eq(websocSection.id, websocSectionToInstructor.sectionId))
      .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
      .innerJoin(
        course,
        eq(course.id, sql`CONCAT(${websocCourse.deptCode},${websocCourse.courseNumber})`),
      )
      .where(inArray(instructor.ucinetid, Array.from(rows.keys())))
      .then((rows) =>
        rows.reduce((acc, row) => {
          if (!row.ucinetid) return acc;
          if (acc.has(row.ucinetid)) {
            acc.get(row.ucinetid)?.push(row);
            return acc;
          }
          return acc.set(row.ucinetid, [row]);
        }, new Map<string, InstructorMetaRow[]>()),
      );
    return Array.from(rows.entries()).map(([ucinetid, row]) => ({
      ...row,
      ...transformMetaRows(metaRows.get(ucinetid) ?? []),
    }));
  }

  async getInstructorByUCInetID(
    ucinetid: string,
  ): Promise<z.infer<typeof instructorSchema> | null> {
    return orNull(
      await this.getInstructorsRaw({
        where: and(eq(instructor.ucinetid, ucinetid), ne(instructor.ucinetid, "student")),
      }).then((x) => x[0]),
    );
  }

  async getInstructors(input: InstructorServiceInput): Promise<z.infer<typeof instructorSchema>[]> {
    return this.getInstructorsRaw({
      where: buildQuery(input),
      offset: input.skip,
      limit: input.take,
    });
  }
}
