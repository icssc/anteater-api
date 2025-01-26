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
    const majorSpecialization = this.db.$with("major_specialization").as(
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
      .with(majorSpecialization)
      .select({
        id: majorSpecialization.id,
        name: majorSpecialization.name,
        specializations: majorSpecialization.specializations,
        type: degree.name,
        division: degree.division,
      })
      .from(majorSpecialization)
      .innerJoin(major, eq(majorSpecialization.id, major.id))
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

  async getMajorRequirements(query: z.infer<typeof majorRequirementsQuerySchema>) {
    return await this.getProgramRequirements({ programType: "major", query });
  }

  async getMinorRequirements(query: z.infer<typeof minorRequirementsQuerySchema>) {
    return await this.getProgramRequirements({ programType: "minor", query });
  }

  async getSpecializationRequirements(
    query: z.infer<typeof specializationRequirementsQuerySchema>,
  ) {
    return await this.getProgramRequirements({ programType: "specialization", query });
  }

  private async getProgramRequirements({
    programType,
    query,
  }:
    | { programType: "major"; query: z.infer<typeof majorRequirementsQuerySchema> }
    | { programType: "minor"; query: z.infer<typeof minorRequirementsQuerySchema> }
    | {
        programType: "specialization";
        query: z.infer<typeof specializationRequirementsQuerySchema>;
      }) {
    const table = {
      major,
      minor,
      specialization,
    }[programType];

    const [got] = await this.db
      .select({ id: table.id, name: table.name, requirements: table.requirements })
      .from(table)
      .where(eq(table.id, query.programId))
      .limit(1);

    if (!got) {
      return null;
    }

    return got;
  }
}
