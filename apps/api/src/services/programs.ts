import type {
  majorRequirementsQuerySchema,
  minorRequirementsQuerySchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq, sql } from "@packages/db/drizzle";
import { degree, major, minor, specialization } from "@packages/db/schema";
import type { z } from "zod";

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getMajors() {
    const major_specialization = this.db.$with("major_specialization").as(
      this.db
        .select({
          id: major.id,
          name: major.name,
          specializations: sql`array_agg(${specialization.id})`.as("specializations"),
        })
        .from(major)
        .innerJoin(specialization, eq(major.id, specialization.majorId))
        .groupBy(major.id),
    );

    return this.db
      .with(major_specialization)
      .select({
        id: major_specialization.id,
        name: major_specialization.name,
        specializations: major_specialization.specializations,
        type: degree.name,
        division: degree.division,
      })
      .from(major_specialization)
      .innerJoin(major, eq(major_specialization.id, major.id))
      .innerJoin(degree, eq(major.degreeId, degree.id));
  }

  async getMinors() {
    return this.db
      .select({
        id: minor.id,
        name: minor.name,
      })
      .from(minor);
  }

  async getSpecializations() {
    return this.db
      .select({
        id: specialization.id,
        majorId: specialization.majorId,
        name: specialization.name,
      })
      .from(specialization);
  }

  async getProgramRequirements(
    program_type: "major" | "minor" | "specialization",
    query:
      | z.infer<typeof majorRequirementsQuerySchema>
      | z.infer<typeof minorRequirementsQuerySchema>
      | z.infer<typeof specializationRequirementsQuerySchema>,
  ) {
    switch (program_type) {
      case "major":
        return await this.getProgramRequirementsInner(major, query);
      case "minor":
        return await this.getProgramRequirementsInner(minor, query);
      case "specialization":
        return await this.getProgramRequirementsInner(specialization, query);
    }
  }

  private async getProgramRequirementsInner(
    table: typeof major | typeof minor | typeof specialization,
    query:
      | z.infer<typeof majorRequirementsQuerySchema>
      | z.infer<typeof minorRequirementsQuerySchema>
      | z.infer<typeof specializationRequirementsQuerySchema>,
  ) {
    const [got] = await this.db
      .select({ id: table.id, name: table.name, requirements: table.requirements })
      .from(table)
      .where(eq(table.id, query.programId))
      .limit(1);

    if (!got) {
      return null;
    }

    return { id: got.id, name: got.name, requirements: got.requirements };
  }
}
