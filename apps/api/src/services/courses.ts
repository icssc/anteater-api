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
import { and, eq, gte, ilike, lt, lte } from "@packages/db/drizzle";
import type { CourseLevel, course } from "@packages/db/schema";
import { courseView } from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import { orNull } from "@packages/stdlib";
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
  if (input.minUnits) {
    conditions.push(gte(courseView.minUnits, input.minUnits.toString(10)));
  }
  if (input.maxUnits) {
    conditions.push(lte(courseView.maxUnits, input.maxUnits.toString(10)));
  }
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
  }): Promise<z.infer<typeof courseSchema>[]> {
    const { where, offset, limit } = input;
    return this.db
      .select()
      .from(courseView)
      .where(where)
      .offset(offset ?? 0)
      .limit(limit ?? 1)
      .then((courses) => courses.map(transformCourse));
  }

  async getCourseById(id: string): Promise<z.infer<typeof courseSchema> | null> {
    return this.getCoursesRaw({ where: eq(courseView.id, id) }).then((x) => orNull(x[0]));
  }

  async getCourses(input: CoursesServiceInput): Promise<z.infer<typeof courseSchema>[]> {
    return this.getCoursesRaw({ where: buildQuery(input), offset: input.skip, limit: input.take });
  }
}
