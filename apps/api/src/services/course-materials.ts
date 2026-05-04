import type { database } from "@packages/db";
import { and, eq, ilike, or, sql } from "@packages/db/drizzle";
import { courseMaterial, websocSection } from "@packages/db/schema";
import type { z } from "zod";
import type { courseMaterialsQuerySchema } from "$schema";

type CourseMaterialsServiceInput = z.infer<typeof courseMaterialsQuerySchema>;

function buildQuery(input: CourseMaterialsServiceInput) {
  const conditions = [];
  if (input.year) {
    conditions.push(eq(courseMaterial.year, input.year));
  }
  if (input.quarter) {
    conditions.push(eq(courseMaterial.quarter, input.quarter));
  }
  if (input.department) {
    conditions.push(eq(courseMaterial.department, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(courseMaterial.courseNumber, input.courseNumber));
  }
  if (input.instructorName) {
    conditions.push(ilike(courseMaterial.instructor, `%${input.instructorName}%`));
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
  if (input.sectionCodes && input.sectionCodes.length > 0) {
    const sectionConditions = input.sectionCodes.map((code) => {
      if (code._type === "ParsedInteger") {
        return eq(websocSection.sectionCode, code.value);
      }
      return and(
        sql`${websocSection.sectionCode} >= ${code.min}`,
        sql`${websocSection.sectionCode} <= ${code.max}`,
      );
    });
    conditions.push(or(...sectionConditions));
  }
  return and(...conditions);
}

export class CourseMaterialsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getCourseMaterials(input: CourseMaterialsServiceInput) {
    const query = this.db
      .select({
        year: courseMaterial.year,
        quarter: courseMaterial.quarter,
        department: courseMaterial.department,
        courseNumber: courseMaterial.courseNumber,
        instructor: courseMaterial.instructor,
        isbn: courseMaterial.isbn,
        author: courseMaterial.author,
        title: courseMaterial.title,
        edition: courseMaterial.edition,
        format: courseMaterial.format,
        requirement: courseMaterial.requirement,
        mmsId: courseMaterial.mmsId,
        link: courseMaterial.link,
      })
      .from(courseMaterial);

    if (input.sectionCodes && input.sectionCodes.length > 0) {
      query.innerJoin(websocSection, eq(courseMaterial.sectionId, websocSection.id));
    }

    return query.where(buildQuery(input));
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
