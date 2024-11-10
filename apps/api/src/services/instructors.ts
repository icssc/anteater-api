import type {
  coursePreviewSchema,
  coursePreviewWithTermsSchema,
  instructorSchema,
  instructorsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import { and, eq, getTableColumns, ilike, ne, sql } from "@packages/db/drizzle";
import { type Term, instructorView } from "@packages/db/schema";
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
  }) {
    const { where, offset, limit } = input;
    return (await this.db
      .select()
      .from(instructorView)
      .where(where)
      .offset(offset ?? 0)
      .limit(limit ?? 1)) as z.infer<typeof instructorSchema>[];
  }

  async getInstructorByUCInetID(
    ucinetid: string,
  ): Promise<z.infer<typeof instructorSchema> | null> {
    const shortenedNamesCte = this.db.$with("shortened_names_cte").as(
      this.db
        .select({
          instructorUcinetid: instructorToWebsocInstructor.instructorUcinetid,
          shortenedNames: sql`ARRAY_AGG(${instructorToWebsocInstructor.websocInstructorName})`.as(
            "shortened_names",
          ),
        })
        .from(instructorToWebsocInstructor)
        .groupBy(instructorToWebsocInstructor.instructorUcinetid),
    );
    const termsCte = this.db.$with("terms_cte").as(
      this.db
        .selectDistinct({
          courseId: course.id,
          instructorUcinetid: instructorToWebsocInstructor.instructorUcinetid,
          terms:
            sql`ARRAY_AGG(DISTINCT CONCAT(${websocCourse.year}, ' ', ${websocCourse.quarter}))`.as(
              "terms",
            ),
        })
        .from(course)
        .innerJoin(websocCourse, eq(websocCourse.courseId, course.id))
        .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
        .innerJoin(
          websocSectionToInstructor,
          eq(websocSectionToInstructor.sectionId, websocSection.id),
        )
        .innerJoin(
          websocInstructor,
          eq(websocInstructor.name, websocSectionToInstructor.instructorName),
        )
        .innerJoin(
          instructorToWebsocInstructor,
          eq(instructorToWebsocInstructor.websocInstructorName, websocInstructor.name),
        )
        .groupBy(course.id, instructorToWebsocInstructor.instructorUcinetid),
    );
    const coursesCte = this.db.$with("courses_cte").as(
      this.db
        .with(termsCte)
        .selectDistinct({
          instructorUcinetid: termsCte.instructorUcinetid,
          courseId: course.id,
          courseInfo: sql`
          CASE WHEN ${course.id} IS NULL
          THEN NULL
          ELSE JSONB_BUILD_OBJECT(
               'id', ${course.id},
               'title', ${course.title},
               'department', ${course.department},
               'courseNumber', ${course.courseNumber},
               'terms', COALESCE(${termsCte.terms}, ARRAY[]::TEXT[])
          )
          END
          `.as("course_info"),
        })
        .from(course)
        .innerJoin(termsCte, eq(termsCte.courseId, course.id))
        .groupBy(course.id, termsCte.instructorUcinetid, termsCte.terms),
    );
    return await this.db
      .with(shortenedNamesCte, coursesCte)
      .select({
        ...getTableColumns(instructor),
        shortenedNames: sql<
          string[]
        >`COALESCE(${shortenedNamesCte.shortenedNames}, ARRAY[]::TEXT[])`.as("shortened_names"),
        courses: sql<z.infer<typeof coursePreviewWithTermsSchema>[]>`
          ARRAY_AGG(DISTINCT ${coursesCte.courseInfo})
        `.as("courses"),
      })
      .from(instructor)
      .innerJoin(shortenedNamesCte, eq(shortenedNamesCte.instructorUcinetid, instructor.ucinetid))
      .innerJoin(coursesCte, eq(coursesCte.instructorUcinetid, instructor.ucinetid))
      .where(and(eq(instructor.ucinetid, ucinetid), ne(instructor.ucinetid, "student")))
      .groupBy(instructor.ucinetid, shortenedNamesCte.shortenedNames)
      .then((x) => orNull(x[0]));
  }

  async getInstructors(input: InstructorServiceInput): Promise<z.infer<typeof instructorSchema>[]> {
    return this.getInstructorsRaw({
      where: buildQuery(input),
      offset: input.skip,
      limit: input.take,
    });
  }
}
