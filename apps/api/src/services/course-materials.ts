import type { database } from "@packages/db";
import { and, eq, ilike } from "@packages/db/drizzle";
import {
  courseMaterial,
  websocCourse,
  websocSection,
  websocSectionToInstructor,
} from "@packages/db/schema";
import type { z } from "zod";
import type { courseMaterialsQuerySchema } from "$schema";

type CourseMaterialsServiceInput = z.infer<typeof courseMaterialsQuerySchema>;

function buildQuery(input: CourseMaterialsServiceInput) {
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
    conditions.push(eq(websocSection.sectionCode, Number.parseInt(input.sectionCode, 10)));
  }
  if (input.author) {
    conditions.push(ilike(courseMaterial.author, `%${input.author}%`));
  }
  if (input.title) {
    conditions.push(ilike(courseMaterial.title, `%${input.title}%`));
  }
  if (input.format) {
    conditions.push(eq(courseMaterial.format, input.format));
  }
  if (input.requirement) {
    conditions.push(eq(courseMaterial.requirement, input.requirement));
  }
  return and(...conditions);
}

export class CourseMaterialsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getCourseMaterials(input: CourseMaterialsServiceInput) {
    const rows = await this.db
      .select({
        materialId: courseMaterial.id,
        id: websocSection.id,
        year: websocSection.year,
        quarter: websocSection.quarter,
        sectionCode: websocSection.sectionCode,
        department: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        courseNumeric: websocCourse.courseNumeric,
        instructors: websocSection.instructors,
        author: courseMaterial.author,
        title: courseMaterial.title,
        edition: courseMaterial.edition,
        format: courseMaterial.format,
        requirement: courseMaterial.requirement,
        isbn: courseMaterial.isbn,
        mmsId: courseMaterial.mmsId,
        link: courseMaterial.link,
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .innerJoin(courseMaterial, eq(courseMaterial.sectionId, websocSection.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .where(buildQuery(input));

    return rows
      .reduce((acc, row) => {
        if (!acc.has(row.materialId)) {
          acc.set(row.materialId, {
            ...row,
            sectionCode: row.sectionCode ? row.sectionCode.toString(10).padStart(5, "0") : "00000",
          });
        }
        return acc;
      }, new Map<string, any>())
      .values()
      .toArray();
  }

  async getCourseMaterialOptions(input: CourseMaterialsServiceInput) {
    const res = await this.db
      .select({
        year: courseMaterial.year,
        department: courseMaterial.department,
        instructor: courseMaterial.instructor,
        format: courseMaterial.format,
      })
      .from(courseMaterial)
      .where(buildQuery(input))
      .then((rows) =>
        rows.reduce(
          (acc, row) => {
            acc.years.add(row.year);
            acc.departments.add(row.department);
            acc.instructors.add(row.instructor);
            acc.formats.add(row.format);
            return acc;
          },
          {
            years: new Set<string>(),
            departments: new Set<string>(),
            instructors: new Set<string>(),
            formats: new Set<string>(),
          },
        ),
      );

    return {
      years: Array.from(res.years),
      departments: Array.from(res.departments),
      instructors: Array.from(res.instructors),
      formats: Array.from(res.formats),
    };
  }
}
