import type {
  coursePreviewSchema,
  courseSchema,
  coursesByCursorQuerySchema,
  coursesQuerySchema,
  instructorPreviewSchema,
  outputCourseLevels,
} from "$schema";
import { outputGECategories } from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import { and, eq, gte, ilike, inArray, lt } from "@packages/db/drizzle";
import type { CourseLevel, course } from "@packages/db/schema";
import { courseView } from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";
import { buildUnitBoundsQuery } from "./util.ts";

type CoursesServiceInput = z.infer<typeof coursesQuerySchema>;

type CoursesServiceOutput = z.infer<typeof courseSchema>;

type CoursesByCursorServiceInput = z.infer<typeof coursesByCursorQuerySchema>;

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
  prerequisites: unknown;
  dependencies: unknown;
  instructors: unknown;
  aliases: unknown;
  terms: string[];
};

const transformCourse = ({
  prerequisites,
  dependencies,
  instructors,
  aliases,
  ...course
}: RawCourse): CoursesServiceOutput => ({
  ...course,
  prerequisites: prerequisites as z.infer<typeof coursePreviewSchema>[],
  dependencies: dependencies as z.infer<typeof coursePreviewSchema>[],
  instructors: instructors as z.infer<typeof instructorPreviewSchema>[],
  minUnits: Number.parseFloat(course.minUnits),
  maxUnits: Number.parseFloat(course.maxUnits),
  courseLevel: mapCourseLevel(course.courseLevel),
  geList: courseToGEList(course),
  aliases: aliases as string[],
});

function buildQuery(input: CoursesServiceInput | CoursesByCursorServiceInput) {
  const conditions: Array<SQL | undefined> = [];
  if (input.department) {
    conditions.push(eq(courseView.department, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(courseView.courseNumber, input.courseNumber));
  }
  if (input.courseNumeric) {
    conditions.push(eq(courseView.courseNumeric, input.courseNumeric));
  }
  if (input.titleContains) {
    conditions.push(ilike(courseView.title, `%${input.titleContains}%`));
  }
  if (input.courseLevel) {
    switch (input.courseLevel) {
      case "LowerDiv":
        conditions.push(and(gte(courseView.courseNumeric, 0), lt(courseView.courseNumeric, 100)));
        break;
      case "UpperDiv":
        conditions.push(and(gte(courseView.courseNumeric, 100), lt(courseView.courseNumeric, 200)));
        break;
      case "Graduate":
        conditions.push(gte(courseView.courseNumeric, 200));
        break;
    }
  }
  conditions.push(...buildUnitBoundsQuery(courseView, input.minUnits, input.maxUnits));
  if (input.descriptionContains) {
    conditions.push(ilike(courseView.description, `%${input.descriptionContains}%`));
  }
  if (input.geCategory) {
    switch (input.geCategory) {
      case "GE-1A":
        conditions.push(isTrue(courseView.isGE1A));
        break;
      case "GE-1B":
        conditions.push(isTrue(courseView.isGE1B));
        break;
      case "GE-2":
        conditions.push(isTrue(courseView.isGE2));
        break;
      case "GE-3":
        conditions.push(isTrue(courseView.isGE3));
        break;
      case "GE-4":
        conditions.push(isTrue(courseView.isGE4));
        break;
      case "GE-5A":
        conditions.push(isTrue(courseView.isGE5A));
        break;
      case "GE-5B":
        conditions.push(isTrue(courseView.isGE5B));
        break;
      case "GE-6":
        conditions.push(isTrue(courseView.isGE6));
        break;
      case "GE-7":
        conditions.push(isTrue(courseView.isGE7));
        break;
      case "GE-8":
        conditions.push(isTrue(courseView.isGE8));
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
    cursor?: string;
  }): Promise<CoursesServiceOutput[]> {
    const { where, offset, limit, cursor } = input;
    return this.db
      .select()
      .from(courseView)
      .where(cursor ? and(where, gte(courseView.id, cursor)) : where)
      .limit(limit ?? 1)
      .offset(offset ?? 0)
      .then((courses) => courses.map(transformCourse));
  }

  async batchGetCourses(ids: string[]): Promise<CoursesServiceOutput[]> {
    return this.getCoursesRaw({ where: inArray(courseView.id, ids), limit: ids.length });
  }

  async getCourseById(id: string): Promise<CoursesServiceOutput | null> {
    return this.getCoursesRaw({ where: eq(courseView.id, id) }).then((x) => orNull(x[0]));
  }

  async getCourses(input: CoursesServiceInput): Promise<CoursesServiceOutput[]> {
    return this.getCoursesRaw({
      where: buildQuery(input),
      offset: input.skip,
      limit: input.take,
    });
  }

  async getCoursesByCursor(
    input: CoursesByCursorServiceInput,
  ): Promise<{ items: CoursesServiceOutput[]; nextCursor: string | null }> {
    const courses = await this.getCoursesRaw({
      where: buildQuery(input),
      cursor: input.cursor,
      limit: input.take + 1,
      offset: 0,
    });

    const items = courses.slice(0, input.take);
    const nextCursor =
      input.take === 0 ? null : courses.length > input.take ? courses[input.take].id : null;

    return {
      items,
      nextCursor,
    };
  }
}
