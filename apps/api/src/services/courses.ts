import type {
  coursePreviewSchema,
  courseSchema,
  coursesQuerySchema,
  instructorPreviewSchema,
  outputCourseLevels,
} from "$schema";
import { outputGECategories } from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import {
  aliasedTable,
  and,
  eq,
  getTableColumns,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "@packages/db/drizzle";
import type { CourseLevel } from "@packages/db/schema";
import {
  course,
  instructor,
  instructorToWebsocInstructor,
  prerequisite,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import { notNull, orNull } from "@packages/stdlib";
import type { z } from "zod";

const mapCourseLevel = (courseLevel: CourseLevel): (typeof outputCourseLevels)[number] =>
  courseLevel === "LowerDiv"
    ? "Lower Division (1-99)"
    : courseLevel === "UpperDiv"
      ? "Upper Division (100-199)"
      : "Graduate/Professional Only (200+)";

const courseToGEList = (
  row: typeof course.$inferSelect,
): Array<(typeof outputGECategories)[number]> =>
  [
    row.isGE1A ? 0 : false,
    row.isGE1B ? 1 : false,
    row.isGE2 ? 2 : false,
    row.isGE3 ? 3 : false,
    row.isGE4 ? 4 : false,
    row.isGE5A ? 5 : false,
    row.isGE5B ? 6 : false,
    row.isGE6 ? 7 : false,
    row.isGE7 ? 8 : false,
    row.isGE8 ? 9 : false,
  ]
    .filter((x) => typeof x !== "boolean")
    .map((x) => outputGECategories[x]);

type RawCourse = typeof course.$inferSelect & {
  prerequisites: z.infer<typeof coursePreviewSchema>[];
  dependencies: z.infer<typeof coursePreviewSchema>[];
  instructors: z.infer<typeof instructorPreviewSchema>[];
  terms: string[];
};

const transformCourse = (course: RawCourse): z.infer<typeof courseSchema> => ({
  ...course,
  minUnits: Number.parseFloat(course.minUnits),
  maxUnits: Number.parseFloat(course.maxUnits),
  courseLevel: mapCourseLevel(course.courseLevel),
  geList: courseToGEList(course),
});

type CoursesServiceInput = z.infer<typeof coursesQuerySchema>;

function buildQuery(input: CoursesServiceInput) {
  const conditions: Array<SQL | undefined> = [];
  if (input.department) {
    conditions.push(eq(course.department, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(course.courseNumber, input.courseNumber));
  }
  if (input.courseNumeric) {
    conditions.push(eq(course.courseNumeric, input.courseNumeric));
  }
  if (input.titleContains) {
    conditions.push(ilike(course.title, `%${input.titleContains}%`));
  }
  if (input.courseLevel) {
    switch (input.courseLevel) {
      case "LowerDiv":
        conditions.push(and(gte(course.courseNumeric, 0), lt(course.courseNumeric, 100)));
        break;
      case "UpperDiv":
        conditions.push(and(gte(course.courseNumeric, 100), lt(course.courseNumeric, 200)));
        break;
      case "Graduate":
        conditions.push(gte(course.courseNumeric, 200));
        break;
    }
  }
  if (input.minUnits) {
    conditions.push(gte(course.minUnits, input.minUnits.toString(10)));
  }
  if (input.maxUnits) {
    conditions.push(lte(course.maxUnits, input.maxUnits.toString(10)));
  }
  if (input.descriptionContains) {
    conditions.push(ilike(course.description, `%${input.descriptionContains}%`));
  }
  if (input.geCategory) {
    switch (input.geCategory) {
      case "GE-1A":
        conditions.push(isTrue(course.isGE1A));
        break;
      case "GE-1B":
        conditions.push(isTrue(course.isGE1B));
        break;
      case "GE-2":
        conditions.push(isTrue(course.isGE2));
        break;
      case "GE-3":
        conditions.push(isTrue(course.isGE3));
        break;
      case "GE-4":
        conditions.push(isTrue(course.isGE4));
        break;
      case "GE-5A":
        conditions.push(isTrue(course.isGE5A));
        break;
      case "GE-5B":
        conditions.push(isTrue(course.isGE5B));
        break;
      case "GE-6":
        conditions.push(isTrue(course.isGE6));
        break;
      case "GE-7":
        conditions.push(isTrue(course.isGE7));
        break;
      case "GE-8":
        conditions.push(isTrue(course.isGE8));
        break;
    }
  }
  return and(...conditions);
}

export class CoursesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getCoursesRaw(input: {
    where?: SQL;
    offset?: number;
    limit?: number;
  }): Promise<z.infer<typeof courseSchema>[]> {
    const { where, offset, limit } = input;
    const dependency = aliasedTable(prerequisite, "dependency");
    const prerequisiteCourse = aliasedTable(course, "prerequisite_course");
    const dependencyCourse = aliasedTable(course, "dependency_course");
    return this.db
      .select({
        ...getTableColumns(course),
        prerequisites: sql`
        COALESCE((
          SELECT ARRAY_AGG(JSON_BUILD_OBJECT(
            'id', ${prerequisiteCourse.id},
            'title', ${prerequisiteCourse.title},
            'department', ${prerequisiteCourse.department},
            'courseNumber', ${prerequisiteCourse.courseNumber}
          ))
         FROM ${prerequisite}
         LEFT JOIN ${course} ${prerequisiteCourse} ON ${prerequisiteCourse.id} = ${prerequisite.prerequisiteId}
         WHERE ${prerequisite.dependencyId} = ${course.id}
         ), ARRAY[]::JSON[]) AS prerequisites
        `.mapWith((xs) => xs.filter((x: z.infer<typeof coursePreviewSchema>) => notNull(x.id))),
        dependencies: sql`
        COALESCE((
          SELECT ARRAY_AGG(JSON_BUILD_OBJECT(
            'id', ${dependencyCourse.id},
            'title', ${dependencyCourse.title},
            'department', ${dependencyCourse.department},
            'courseNumber', ${dependencyCourse.courseNumber}
          ))
         FROM ${prerequisite} ${dependency}
         LEFT JOIN ${course} ${dependencyCourse} ON ${dependencyCourse.id} = ${dependency.dependencyId}
         WHERE ${dependency.prerequisiteId} = ${course.id}
         ), ARRAY[]::JSON[]) AS dependencies
        `.mapWith((xs) => xs.filter((x: z.infer<typeof coursePreviewSchema>) => notNull(x.id))),
        terms:
          sql`ARRAY_AGG(DISTINCT CONCAT(${websocCourse.year}, ' ', ${websocCourse.quarter}))`.mapWith(
            (xs) => xs.filter((x: string) => x !== " "),
          ),
        instructors: sql`
        COALESCE(ARRAY_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'ucinetid', ${instructor.ucinetid},
          'name', ${instructor.name},
          'title', ${instructor.title},
          'email', ${instructor.email},
          'department', ${instructor.department},
          'shortenedNames', ARRAY(
            SELECT ${instructorToWebsocInstructor.websocInstructorName}
            FROM ${instructorToWebsocInstructor}
            WHERE ${instructorToWebsocInstructor.instructorUcinetid} = ${instructor.ucinetid}
          )
        )), ARRAY[]::JSONB[]) AS instructors
        `.mapWith((xs) =>
          xs.filter((x: z.infer<typeof instructorPreviewSchema>) => notNull(x.ucinetid)),
        ),
      })
      .from(course)
      .leftJoin(websocCourse, eq(websocCourse.courseId, course.id))
      .leftJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.sectionId, websocSection.id),
      )
      .leftJoin(
        websocInstructor,
        eq(websocInstructor.name, websocSectionToInstructor.instructorName),
      )
      .leftJoin(
        instructorToWebsocInstructor,
        eq(instructorToWebsocInstructor.websocInstructorName, websocInstructor.name),
      )
      .leftJoin(
        instructor,
        eq(instructor.ucinetid, instructorToWebsocInstructor.instructorUcinetid),
      )
      .where(and(where, or(isNull(instructor.ucinetid), ne(instructor.ucinetid, "student"))))
      .orderBy(course.id)
      .groupBy(course.id)
      .offset(offset ?? 0)
      .limit(limit ?? 1)
      .then((courses) => courses.map(transformCourse));
  }

  async getCourseById(id: string): Promise<z.infer<typeof courseSchema> | null> {
    return orNull(await this.getCoursesRaw({ where: eq(course.id, id) }).then((x) => x[0]));
  }

  async getCourses(input: CoursesServiceInput): Promise<z.infer<typeof courseSchema>[]> {
    return this.getCoursesRaw({ where: buildQuery(input), offset: input.skip, limit: input.take });
  }
}
