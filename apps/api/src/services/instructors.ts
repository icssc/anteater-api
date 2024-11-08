import type {
  coursePreviewWithTermsSchema,
  instructorSchema,
  instructorsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import { and, eq, getTableColumns, ilike, ne, sql } from "@packages/db/drizzle";
import {
  course,
  instructor,
  instructorToWebsocInstructor,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { notNull, orNull } from "@packages/stdlib";
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

export class InstructorsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getInstructorsRaw(input: {
    where?: SQL;
    offset?: number;
    limit?: number;
  }): Promise<z.infer<typeof instructorSchema>[]> {
    const { where, offset, limit } = input;
    const cte = this.db.$with("cte").as(
      this.db
        .select({
          ...getTableColumns(instructor),
          shortenedNames: sql<string[]>`
          ARRAY(
            SELECT ${instructorToWebsocInstructor.websocInstructorName}
            FROM ${instructorToWebsocInstructor}
            WHERE ${instructorToWebsocInstructor.instructorUcinetid} = ${instructor.ucinetid}
          )`.as("shortened_names"),
          courses: sql`
          ARRAY(
            SELECT DISTINCT JSONB_BUILD_OBJECT(
              'id', ${course}.${course.id},
              'title', ${course}.${course.title},
              'department', ${course}.${course.department},
              'courseNumber', ${course}.${course.courseNumber},
              'terms', COALESCE("t"."terms", ARRAY[]::TEXT[])
            )
            FROM ${course}
            INNER JOIN ${websocCourse} ON ${websocCourse}.${websocCourse.courseId} = ${course}.${course.id}
            INNER JOIN ${websocSection} ON ${websocSection}.${websocSection.courseId} = ${websocCourse}.${websocCourse.id}
            INNER JOIN ${websocSectionToInstructor} ON ${websocSectionToInstructor.sectionId} = ${websocSection}.${websocSection.id}
            INNER JOIN ${websocInstructor} ON ${websocInstructor.name} = ${websocSectionToInstructor.instructorName}
            INNER JOIN ${instructorToWebsocInstructor} ON ${instructorToWebsocInstructor.websocInstructorName} = ${websocInstructor.name}
            LEFT JOIN LATERAL (
              SELECT ARRAY_AGG(DISTINCT CONCAT(${websocCourse}.${websocCourse.year}, ' ', ${websocCourse}.${websocCourse.quarter})) AS terms
              FROM ${websocCourse}
              WHERE ${websocCourse}.${websocCourse.courseId} = ${course}.${course.id}
              GROUP BY ${websocCourse}.${websocCourse.courseId}
            ) t ON TRUE
            WHERE ${instructorToWebsocInstructor.instructorUcinetid} = ${instructor.ucinetid}
          )
        `
            .mapWith((xs) =>
              xs.filter((x: z.infer<typeof coursePreviewWithTermsSchema>) => notNull(x.id)),
            )
            .as("courses"),
        })
        .from(instructor)
        .where(where),
    );
    return this.db
      .with(cte)
      .select()
      .from(cte)
      .offset(offset ?? 0)
      .limit(limit ?? 1);
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
