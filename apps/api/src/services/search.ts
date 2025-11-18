import type {
  courseSchema,
  instructorSchema,
  searchQuerySchema,
  searchResponseSchema,
} from "$schema";
import type { z } from "@hono/zod-openapi";
import type { database } from "@packages/db";
import { and, asc, desc, inArray, or, sql } from "@packages/db/drizzle";
import { unionAll } from "@packages/db/drizzle-pg";
import { course, instructor } from "@packages/db/schema";
import { getFromMapOrThrow } from "@packages/stdlib";
import type { CoursesService } from "./courses";
import type { InstructorsService } from "./instructors";
import { buildCourseLevelQuery, buildGEQuery, buildUnitBoundsQuery } from "./util.ts";

const COURSES_WEIGHTS = sql`(
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.id}, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.department}, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.departmentAlias}, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.shortenedDept}, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.courseNumber}, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.courseNumeric}::TEXT, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.title}, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${course.description}, '')), 'D')
  )`;

const INSTRUCTORS_WEIGHTS = sql`(
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${instructor.ucinetid}, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${instructor.name}, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('english', COALESCE(${instructor.title}, '')), 'B')
  )`;

function splitAtLastNumber(s: string): string {
  const i = s
    .matchAll(/\d+/g)
    .map((x) => x.index)
    .toArray()
    .slice(-1)[0];
  return i === undefined ? s : `${s.slice(0, i)} ${s.slice(i)}`;
}

function toQuery(query: string) {
  const normalizedQuery = splitAtLastNumber(query)
    .replaceAll(/ {2,}/g, " ")
    .replaceAll(/-/g, "\\-")
    .split(" ")
    .map((x) => x.replace(/^\\-/, "-"))
    .join(" ");
  const tsQuery = sql`WEBSEARCH_TO_TSQUERY('english', ${normalizedQuery})`;
  return sql`CASE WHEN NUMNODE(${tsQuery}) > 0 THEN TO_TSQUERY('english', ${tsQuery}::TEXT || ':*') ELSE '' END`;
}

type SearchServiceInput = z.infer<typeof searchQuerySchema>;
type SearchResultType = "course" | "instructor";

export class SearchService {
  constructor(
    private readonly db: ReturnType<typeof database>,
    private readonly coursesService: CoursesService,
    private readonly instructorsService: InstructorsService,
  ) {}

  private buildCourseConditions(input: SearchServiceInput) {
    const geIn = input.ge ?? [];

    const courseConditions = [
      or(...geIn.flatMap((ge) => buildGEQuery(course, ge))),
      or(...(input.courseLevel ?? []).map((lvl) => and(...buildCourseLevelQuery(course, lvl)))),
      ...buildUnitBoundsQuery(course, input.minUnits, input.maxUnits),
    ];

    if (input.department) {
      courseConditions.push(inArray(course.department, input.department));
    }

    return and(...courseConditions);
  }

  private async courseMappingFromResults(results: Map<string, number>) {
    return await this.coursesService
      .batchGetCourses(results.keys().toArray())
      .then((courses) =>
        courses.reduce(
          (acc, course) => acc.set(course.id, course),
          new Map<string, z.infer<typeof courseSchema>>(),
        ),
      );
  }

  private async instructorMappingFromResults(results: Map<string, number>) {
    return await this.instructorsService
      .batchGetInstructors(results.keys().toArray())
      .then((instructors) =>
        instructors.reduce(
          (acc, instructor) => acc.set(instructor.ucinetid, instructor),
          new Map<string, z.infer<typeof instructorSchema>>(),
        ),
      );
  }

  private async doSearchForCourses(
    input: SearchServiceInput,
  ): Promise<z.infer<typeof searchResponseSchema>> {
    const query = toQuery(input.query);
    const results = await this.db
      .select({
        id: course.id,
        rank: sql`TS_RANK(${COURSES_WEIGHTS}, ${query})`.mapWith(Number),
      })
      .from(course)
      .where(and(this.buildCourseConditions(input), sql`${COURSES_WEIGHTS} @@ ${query}`))
      .orderBy((t) => [desc(t.rank), asc(t.id)])
      .then((rows) =>
        rows.reduce((acc, row) => acc.set(row.id, row.rank), new Map<string, number>()),
      );
    const courses = await this.courseMappingFromResults(results);
    return {
      count: results.size,
      results: results
        .entries()
        .map(([key, rank]) => ({
          type: "course" as const,
          result: getFromMapOrThrow(courses, key),
          rank,
        }))
        .drop(input.skip)
        .take(input.take)
        .toArray(),
    };
  }

  private async doSearchForInstructors(
    input: SearchServiceInput,
  ): Promise<z.infer<typeof searchResponseSchema>> {
    const query = toQuery(input.query);
    const results = await this.db
      .select({
        id: instructor.ucinetid,
        rank: sql`TS_RANK(${INSTRUCTORS_WEIGHTS}, ${query})`.mapWith(Number),
      })
      .from(instructor)
      .where(sql`${INSTRUCTORS_WEIGHTS} @@ ${query}`)
      .offset(input.skip)
      .limit(input.take)
      .orderBy((t) => [desc(t.rank), asc(t.id)])
      .then((rows) =>
        rows.reduce((acc, row) => acc.set(row.id, row.rank), new Map<string, number>()),
      );
    const instructors = await this.instructorMappingFromResults(results);
    return {
      count: results.size,
      results: results
        .entries()
        .map(([key, rank]) => ({
          type: "instructor" as const,
          result: getFromMapOrThrow(instructors, key),
          rank,
        }))
        .drop(input.skip)
        .take(input.take)
        .toArray(),
    };
  }

  async doSearch(input: SearchServiceInput): Promise<z.infer<typeof searchResponseSchema>> {
    if (input.resultType === "instructor") {
      return this.doSearchForInstructors(input);
    }

    if (input.resultType === "course") {
      return this.doSearchForCourses(input);
    }

    const query = toQuery(input.query);
    const results = await unionAll(
      this.db
        .select({
          type: sql<SearchResultType>`'course'`,
          id: course.id,
          rank: sql`TS_RANK(${COURSES_WEIGHTS}, ${query})`.mapWith(Number),
        })
        .from(course)
        .where(and(this.buildCourseConditions(input), sql`${COURSES_WEIGHTS} @@ ${query}`)),
      this.db
        .select({
          type: sql<SearchResultType>`'instructor'`,
          id: instructor.ucinetid,
          rank: sql`TS_RANK(${INSTRUCTORS_WEIGHTS}, ${query})`.mapWith(Number),
        })
        .from(instructor)
        .where(sql`${INSTRUCTORS_WEIGHTS} @@ ${query}`),
    ).then((rows) =>
      rows.reduce(
        (acc, row) => {
          acc[row.type].set(row.id, row.rank);
          return acc;
        },
        {
          course: new Map<string, number>(),
          instructor: new Map<string, number>(),
        },
      ),
    );

    const lookedUp = {
      course: await this.courseMappingFromResults(results.course),
      instructor: await this.instructorMappingFromResults(results.instructor),
    };

    return {
      count: results.course.size + results.instructor.size,
      results: [
        ...results.course.entries().map(([key, rank]) => ({
          key,
          type: "course" as const,
          result: getFromMapOrThrow(lookedUp.course, key),
          rank,
        })),
        ...results.instructor.entries().map(([key, rank]) => ({
          key,
          type: "instructor" as const,
          result: getFromMapOrThrow(lookedUp.instructor, key),
          rank,
        })),
      ]
        .toSorted((a, b) => {
          const rankDiff = b.rank - a.rank;
          return Math.abs(rankDiff) < Number.EPSILON
            ? a.key.localeCompare(b.key)
            : Math.sign(rankDiff);
        })
        .slice(input.skip, input.skip + input.take),
    };
  }
}
