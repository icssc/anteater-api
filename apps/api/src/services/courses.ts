import {
  type coursePreviewSchema,
  type courseSchema,
  type coursesQuerySchema,
  type instructorPreviewSchema,
  type outputCourseLevels,
  outputGECategories,
} from "$schema";
import type { database } from "@packages/db";
import {
  type SQL,
  aliasedTable,
  and,
  eq,
  getTableColumns,
  gte,
  ilike,
  lt,
  lte,
  ne,
} from "@packages/db/drizzle";
import {
  type CourseLevel,
  type Term,
  instructor,
  instructorToWebsocInstructor,
  websocInstructor,
} from "@packages/db/schema";
import {
  course,
  prerequisite,
  websocCourse,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import { getFromMapOrThrow } from "@packages/stdlib";
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

type RawCourse = {
  row: typeof course.$inferSelect;
  prerequisites: z.infer<typeof coursePreviewSchema>[];
  dependencies: z.infer<typeof coursePreviewSchema>[];
  instructors: z.infer<typeof instructorPreviewSchema>[];
  terms: string[];
};

const transformCourse = ({
  row,
  prerequisites,
  dependencies,
  instructors,
  terms,
}: RawCourse): z.infer<typeof courseSchema> => ({
  ...row,
  minUnits: Number.parseFloat(row.minUnits),
  maxUnits: Number.parseFloat(row.maxUnits),
  courseLevel: mapCourseLevel(row.courseLevel),
  geList: courseToGEList(row),
  prerequisites,
  dependencies,
  instructors,
  terms,
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

type CourseMetaRow = {
  prerequisite: z.infer<typeof coursePreviewSchema> | null;
  dependency: z.infer<typeof coursePreviewSchema> | null;
  term: {
    year: string;
    quarter: Term;
  } | null;
  websocInstructor: string | null;
  instructor: Omit<z.infer<typeof instructorPreviewSchema>, "shortenedNames">;
};

function transformMetaRows(rows: CourseMetaRow[]) {
  const prerequisites = new Map<string, NonNullable<CourseMetaRow["prerequisite"]>>();
  const dependencies = new Map<string, NonNullable<CourseMetaRow["dependency"]>>();
  const terms = new Set<string>();
  const instructors = new Map<
    string,
    NonNullable<CourseMetaRow["instructor"]> & { shortenedNames: Set<string> }
  >();
  for (const { prerequisite, dependency, term, websocInstructor, instructor } of rows) {
    prerequisite && prerequisites.set(prerequisite.id, prerequisite);
    dependency && dependencies.set(dependency.id, dependency);
    term && terms.add(`${term.year} ${term.quarter}`);
    websocInstructor &&
      instructors.set(instructor.ucinetid, {
        ...instructor,
        shortenedNames:
          instructors.get(instructor.ucinetid)?.shortenedNames?.add(websocInstructor) ??
          new Set([websocInstructor]),
      });
  }
  return {
    prerequisites: Array.from(prerequisites.values()),
    dependencies: Array.from(dependencies.values()),
    terms: Array.from(terms),
    instructors: Array.from(instructors.values()).map(({ shortenedNames, ...rest }) => ({
      ...rest,
      shortenedNames: Array.from(new Set(shortenedNames)),
    })),
  };
}

export class CoursesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getCourseById(id: string): Promise<z.infer<typeof courseSchema> | null> {
    const dependency = aliasedTable(prerequisite, "dependency");
    const prerequisiteCourse = aliasedTable(course, "prerequisite_course");
    const dependencyCourse = aliasedTable(course, "dependency_course");
    const [row] = await this.db
      .select()
      .from(course)
      .where(and(eq(course.id, id)));
    if (!row) return null;
    const meta = await this.db
      .select({
        prerequisite: {
          id: prerequisiteCourse.id,
          title: prerequisiteCourse.title,
          department: prerequisiteCourse.department,
          courseNumber: prerequisiteCourse.courseNumber,
        },
        dependency: {
          id: dependencyCourse.id,
          title: dependencyCourse.title,
          department: dependencyCourse.department,
          courseNumber: dependencyCourse.courseNumber,
        },
        term: {
          year: websocCourse.year,
          quarter: websocCourse.quarter,
        },
        websocInstructor: websocInstructor.name,
        instructor: getTableColumns(instructor),
      })
      .from(course)
      .innerJoin(prerequisite, eq(prerequisite.dependencyId, course.id))
      .innerJoin(prerequisiteCourse, eq(prerequisiteCourse.id, prerequisite.prerequisiteId))
      .innerJoin(dependency, eq(dependency.prerequisiteId, course.id))
      .innerJoin(dependencyCourse, eq(dependencyCourse.id, dependency.dependencyId))
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
      .rightJoin(
        instructor,
        eq(instructor.ucinetid, instructorToWebsocInstructor.instructorUcinetid),
      )
      .where(and(eq(course.id, id), ne(instructor.ucinetid, "student")));
    return transformCourse({ row, ...transformMetaRows(meta) });
  }

  async getCourses(input: CoursesServiceInput): Promise<z.infer<typeof courseSchema>[]> {
    const dependency = aliasedTable(prerequisite, "dependency");
    const prerequisiteCourse = aliasedTable(course, "prerequisite_course");
    const dependencyCourse = aliasedTable(course, "dependency_course");
    const rows = await this.db
      .select(getTableColumns(course))
      .from(course)
      .where(buildQuery(input))
      .then((rows) =>
        rows.reduce(
          (acc, row) => acc.set(row.id, row),
          new Map<string, typeof course.$inferSelect>(),
        ),
      );
    if (!rows.size) return [];
    const metaRows = await this.db
      .select({
        courseId: course.id,
        prerequisite: {
          id: prerequisiteCourse.id,
          title: prerequisiteCourse.title,
          department: prerequisiteCourse.department,
          courseNumber: prerequisiteCourse.courseNumber,
        },
        dependency: {
          id: dependencyCourse.id,
          title: dependencyCourse.title,
          department: dependencyCourse.department,
          courseNumber: dependencyCourse.courseNumber,
        },
        term: {
          year: websocCourse.year,
          quarter: websocCourse.quarter,
        },
        websocInstructor: websocInstructor.name,
        instructor: getTableColumns(instructor),
      })
      .from(course)
      .innerJoin(prerequisite, eq(prerequisite.dependencyId, course.id))
      .innerJoin(prerequisiteCourse, eq(prerequisiteCourse.id, prerequisite.prerequisiteId))
      .innerJoin(dependency, eq(dependency.prerequisiteId, course.id))
      .innerJoin(dependencyCourse, eq(dependencyCourse.id, dependency.dependencyId))
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
      .rightJoin(
        instructor,
        eq(instructor.ucinetid, instructorToWebsocInstructor.instructorUcinetid),
      )
      .where(and(buildQuery(input), ne(instructor.ucinetid, "student")))
      .then((rows) =>
        rows.reduce((acc, row) => {
          if (!row.courseId) return acc;
          if (acc.has(row.courseId)) {
            acc.get(row.courseId)?.push(row);
            return acc;
          }
          return acc.set(row.courseId, [row]);
        }, new Map<string, CourseMetaRow[]>()),
      );
    return Array.from(metaRows.entries()).map(([id, meta]) =>
      transformCourse({ row: getFromMapOrThrow(rows, id), ...transformMetaRows(meta) }),
    );
  }

  async getAllCourses() {
    return this.getCourses({});
  }
}
