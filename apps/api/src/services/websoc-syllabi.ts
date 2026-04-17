import type { database } from "@packages/db";
import { and, eq, gt } from "@packages/db/drizzle";
import { websocCourse, websocSection, websocSectionToInstructor } from "@packages/db/schema";
import type { z } from "zod";
import type { syllabiQuerySchema, syllabiSchema } from "$schema";

type SyllabiServiceInput = z.infer<typeof syllabiQuerySchema>;
type SyllabiServiceOutput = z.infer<typeof syllabiSchema>;

export class SyllabiService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getSyllabi(input: SyllabiServiceInput): Promise<SyllabiServiceOutput[]> {
    const conditions = [eq(websocCourse.courseId, input.courseId), gt(websocSection.webURL, "")];
    if (input.year) {
      conditions.push(eq(websocSection.year, input.year));
    }
    if (input.quarter) {
      conditions.push(eq(websocSection.quarter, input.quarter));
    }
    if (input.instructor) {
      conditions.push(eq(websocSectionToInstructor.instructorName, input.instructor));
    }
    return this.db
      .selectDistinct({
        year: websocSection.year,
        quarter: websocSection.quarter,
        url: websocSection.webURL,
      })
      .from(websocSection)
      .innerJoin(websocCourse, eq(websocSection.courseId, websocCourse.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.sectionId, websocSection.id),
      )
      .where(and(...conditions))
      .then((rows) =>
        rows.map((row) => ({
          year: row.year,
          quarter: row.quarter,
          url: row.url,
        })),
      );
  }
}
