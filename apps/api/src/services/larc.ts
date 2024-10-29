import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import type { z } from "zod";

import { and } from "@packages/db/drizzle";
import { larcSection, websocCourse } from "@packages/db/schema";
import type { larcQuerySchema, larcSectionSchema } from "../schema/larc.ts";

type LarcSessionServiceInput = z.infer<typeof larcQuerySchema>;

function buildQuery(input: LarcSessionServiceInput) {
  const conditions = [];

  if (input.year) {
    conditions.push(eq(websocCourse.year, input.year));
  }
  if (input.quarter) {
    conditions.push(eq(websocCourse.quarter, input.quarter));
  }
  if (input.department) {
    conditions.push(eq(websocCourse.deptCode, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(websocCourse.courseNumber, input.courseNumber));
  }
  if (input.instructor) {
    conditions.push(eq(larcSection.instructor, input.instructor));
  }
  if (input.bldg) {
    conditions.push(eq(larcSection.bldg, input.bldg.toUpperCase()));
  }

  return and(...conditions);
}

export class LarcService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getLarcSections(
    input: LarcSessionServiceInput,
  ): Promise<z.infer<typeof larcSectionSchema>[]> {
    const rows = await this.db
      .select({
        days: larcSection.days,
        time: larcSection.time,
        instructor: larcSection.instructor,
        bldg: larcSection.bldg,
        websocCourse: {
          deptCode: websocCourse.deptCode,
          courseTitle: websocCourse.courseTitle,
          courseNumber: websocCourse.courseNumber,
          year: websocCourse.year,
          quarter: websocCourse.quarter,
        },
      })
      .from(larcSection)
      .where(buildQuery(input))
      .innerJoin(websocCourse, eq(websocCourse.id, larcSection.courseId));

    return rows;
  }
}
