import type { aggregateGradesSchema, gradesQuerySchema, rawGradeSchema } from "$schema";
import type { database } from "@packages/db";
import { and, avg, eq, gt, inArray, or, sql, sum } from "@packages/db/drizzle";
import {
  websocCourse,
  websocSection,
  websocSectionGrade,
  websocSectionToInstructor,
} from "@packages/db/schema";
import type { z } from "zod";

import { buildDivisionQuery, buildGEQuery } from "./util.ts";

type GradesServiceInput = z.infer<typeof gradesQuerySchema>;

function buildQuery(input: GradesServiceInput) {
  const conditions = [];
  if (input.year) {
    conditions.push(eq(websocCourse.year, input.year));
  }
  if (input.quarter) {
    conditions.push(eq(websocCourse.quarter, input.quarter));
  }
  if (input.instructor) {
    conditions.push(eq(websocSectionToInstructor.instructorName, input.instructor));
  }
  if (input.department) {
    conditions.push(eq(websocCourse.deptCode, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(websocCourse.courseNumber, input.courseNumber));
  }
  if (input.sectionCode) {
    conditions.push(eq(websocSection.sectionCode, Number.parseInt(input.sectionCode)));
  }
  conditions.push(...buildDivisionQuery(input.division));
  conditions.push(...buildGEQuery(websocCourse, input.ge));
  if (input.excludePNP) {
    conditions.push(
      or(
        gt(websocSectionGrade.gradeACount, 0),
        gt(websocSectionGrade.gradeBCount, 0),
        gt(websocSectionGrade.gradeCCount, 0),
        gt(websocSectionGrade.gradeDCount, 0),
        gt(websocSectionGrade.gradeFCount, 0),
      ),
    );
  }
  return and(...conditions);
}

export class GradesService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getRawGrades(input: GradesServiceInput) {
    return this.db
      .select({
        id: websocSection.id,
        year: websocSection.year,
        quarter: websocSection.quarter,
        sectionCode: websocSection.sectionCode,
        department: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        courseNumeric: websocCourse.courseNumeric,
        isGE1A: websocCourse.isGE1A,
        isGE1B: websocCourse.isGE1B,
        isGE2: websocCourse.isGE2,
        isGE3: websocCourse.isGE3,
        isGE4: websocCourse.isGE4,
        isGE5A: websocCourse.isGE5A,
        isGE5B: websocCourse.isGE5B,
        isGE6: websocCourse.isGE6,
        isGE7: websocCourse.isGE7,
        isGE8: websocCourse.isGE8,
        gradeACount: websocSectionGrade.gradeACount,
        gradeBCount: websocSectionGrade.gradeBCount,
        gradeCCount: websocSectionGrade.gradeCCount,
        gradeDCount: websocSectionGrade.gradeDCount,
        gradeFCount: websocSectionGrade.gradeFCount,
        gradePCount: websocSectionGrade.gradePCount,
        gradeNPCount: websocSectionGrade.gradeNPCount,
        gradeWCount: websocSectionGrade.gradeWCount,
        averageGPA: websocSectionGrade.averageGPA,
        instructors: websocSection.instructors,
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(websocSectionGrade, eq(websocSectionGrade.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .where(buildQuery(input))
      .then((rows) =>
        rows
          .reduce(
            (acc, row) =>
              acc.has(row.id)
                ? acc
                : acc.set(row.id, {
                    ...row,
                    averageGPA: row.averageGPA ? Number.parseFloat(row.averageGPA) : null,
                    sectionCode: row.sectionCode.toString(10).padStart(5, "0"),
                    geCategories: (
                      [
                        row.isGE1A && "GE-1A",
                        row.isGE1B && "GE-1B",
                        row.isGE2 && "GE-2",
                        row.isGE3 && "GE-3",
                        row.isGE4 && "GE-4",
                        row.isGE5A && "GE-5A",
                        row.isGE5B && "GE-5B",
                        row.isGE6 && "GE-6",
                        row.isGE7 && "GE-7",
                        row.isGE8 && "GE-8",
                      ] as const
                    ).filter((x) => x !== false),
                  }),
            new Map<string, z.infer<typeof rawGradeSchema>>(),
          )
          .values()
          .toArray(),
      );
  }

  async getGradesOptions(input: GradesServiceInput) {
    const res = await this.db
      .select({
        year: websocCourse.year,
        department: websocCourse.deptCode,
        sectionCode: websocSection.sectionCode,
        instructor: websocSectionToInstructor.instructorName,
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(websocSectionGrade, eq(websocSectionGrade.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .where(buildQuery(input))
      .then((rows) =>
        rows.reduce(
          (acc, row) => {
            acc.years.add(row.year);
            acc.departments.add(row.department);
            acc.sectionCodes.add(row.sectionCode.toString(10).padStart(5, "0"));
            row.instructor && acc.instructors.add(row.instructor);
            return acc;
          },
          {
            years: new Set<string>(),
            departments: new Set<string>(),
            sectionCodes: new Set<string>(),
            instructors: new Set<string>(),
          },
        ),
      );
    return {
      years: Array.from(res.years),
      departments: Array.from(res.departments),
      sectionCodes: Array.from(res.sectionCodes),
      instructors: Array.from(res.instructors),
    };
  }

  async getAggregateGrades(input: GradesServiceInput) {
    const sectionMapping = await this.db
      .select({
        id: websocSection.id,
        year: websocSection.year,
        quarter: websocSection.quarter,
        sectionCode: websocSection.sectionCode,
        department: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        courseNumeric: websocCourse.courseNumeric,
        instructors: websocSection.instructors,
        isGE1A: websocCourse.isGE1A,
        isGE1B: websocCourse.isGE1B,
        isGE2: websocCourse.isGE2,
        isGE3: websocCourse.isGE3,
        isGE4: websocCourse.isGE4,
        isGE5A: websocCourse.isGE5A,
        isGE5B: websocCourse.isGE5B,
        isGE6: websocCourse.isGE6,
        isGE7: websocCourse.isGE7,
        isGE8: websocCourse.isGE8,
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(websocSectionGrade, eq(websocSectionGrade.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .where(buildQuery(input))
      .then((rows) =>
        rows.reduce(
          (acc, row) =>
            acc.has(row.id)
              ? acc
              : acc.set(row.id, {
                  ...row,
                  sectionCode: row.sectionCode.toString(10).padStart(5, "0"),
                  geCategories: (
                    [
                      row.isGE1A && "GE-1A",
                      row.isGE1B && "GE-1B",
                      row.isGE2 && "GE-2",
                      row.isGE3 && "GE-3",
                      row.isGE4 && "GE-4",
                      row.isGE5A && "GE-5A",
                      row.isGE5B && "GE-5B",
                      row.isGE6 && "GE-6",
                      row.isGE7 && "GE-7",
                      row.isGE8 && "GE-8",
                    ] as const
                  ).filter((x) => x !== false),
                }),
          new Map<string, z.infer<typeof aggregateGradesSchema>["sectionList"][number]>(),
        ),
      );
    if (!sectionMapping.size)
      return {
        sectionList: [],
        gradeDistribution: {
          gradeACount: 0,
          gradeBCount: 0,
          gradeCCount: 0,
          gradeDCount: 0,
          gradeFCount: 0,
          gradePCount: 0,
          gradeNPCount: 0,
          gradeWCount: 0,
          averageGPA: null,
        },
      };
    const [gradeDistribution] = await this.db
      .select({
        gradeACount: sum(websocSectionGrade.gradeACount).mapWith(Number),
        gradeBCount: sum(websocSectionGrade.gradeBCount).mapWith(Number),
        gradeCCount: sum(websocSectionGrade.gradeCCount).mapWith(Number),
        gradeDCount: sum(websocSectionGrade.gradeDCount).mapWith(Number),
        gradeFCount: sum(websocSectionGrade.gradeFCount).mapWith(Number),
        gradePCount: sum(websocSectionGrade.gradePCount).mapWith(Number),
        gradeNPCount: sum(websocSectionGrade.gradeNPCount).mapWith(Number),
        gradeWCount: sum(websocSectionGrade.gradeWCount).mapWith(Number),
        averageGPA: avg(websocSectionGrade.averageGPA).mapWith(Number),
      })
      .from(websocSectionGrade)
      .where(inArray(websocSectionGrade.sectionId, sectionMapping.keys().toArray()));
    return {
      sectionList: sectionMapping.values().toArray(),
      gradeDistribution,
    };
  }

  async getAggregateGradesByCourse(input: GradesServiceInput) {
    return this.db
      .select({
        department: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        gradeACount: sum(websocSectionGrade.gradeACount).mapWith(Number),
        gradeBCount: sum(websocSectionGrade.gradeBCount).mapWith(Number),
        gradeCCount: sum(websocSectionGrade.gradeCCount).mapWith(Number),
        gradeDCount: sum(websocSectionGrade.gradeDCount).mapWith(Number),
        gradeFCount: sum(websocSectionGrade.gradeFCount).mapWith(Number),
        gradePCount: sum(websocSectionGrade.gradePCount).mapWith(Number),
        gradeNPCount: sum(websocSectionGrade.gradeNPCount).mapWith(Number),
        gradeWCount: sum(websocSectionGrade.gradeWCount).mapWith(Number),
        averageGPA: avg(websocSectionGrade.averageGPA).mapWith(Number),
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(websocSectionGrade, eq(websocSectionGrade.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .groupBy(websocCourse.deptCode, websocCourse.courseNumber)
      .where(buildQuery(input));
  }

  async getAggregateGradesByOffering(input: GradesServiceInput) {
    return this.db
      .select({
        department: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        instructor: sql<string>`COALESCE(
                ${websocSectionToInstructor.instructorName},
                'STAFF'
                )`,
        gradeACount: sum(websocSectionGrade.gradeACount).mapWith(Number),
        gradeBCount: sum(websocSectionGrade.gradeBCount).mapWith(Number),
        gradeCCount: sum(websocSectionGrade.gradeCCount).mapWith(Number),
        gradeDCount: sum(websocSectionGrade.gradeDCount).mapWith(Number),
        gradeFCount: sum(websocSectionGrade.gradeFCount).mapWith(Number),
        gradePCount: sum(websocSectionGrade.gradePCount).mapWith(Number),
        gradeNPCount: sum(websocSectionGrade.gradeNPCount).mapWith(Number),
        gradeWCount: sum(websocSectionGrade.gradeWCount).mapWith(Number),
        averageGPA: avg(websocSectionGrade.averageGPA).mapWith(Number),
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(websocSectionGrade, eq(websocSectionGrade.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .groupBy(
        websocCourse.deptCode,
        websocCourse.courseNumber,
        websocSectionToInstructor.instructorName,
      )
      .where(buildQuery(input));
  }
}
