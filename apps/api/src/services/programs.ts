import type {
  majorQuerySchema,
  majorRequirementsQuerySchema,
  minorQuerySchema,
  minorRequirementsQuerySchema,
  specializationQuerySchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq, sql } from "@packages/db/drizzle";
import { degree, major, minor, specialization } from "@packages/db/schema";
import type { z } from "zod";

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getMajors(query: z.infer<typeof majorQuerySchema>) {
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

    const majorBuilder = this.db
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

    if (query.majorId) {
      majorBuilder.where(eq(major.id, query.majorId));
    }

    return majorBuilder;
  }

  async getMinors(query: z.infer<typeof minorQuerySchema>) {
    const minorBuilder = this.db
      .select({
        id: minor.id,
        name: minor.name,
      })
      .from(minor);

    if (query.id) {
      minorBuilder.where(eq(minor.id, query.id));
    }

    return minorBuilder;
  }

  async getSpecializations(query: z.infer<typeof specializationQuerySchema>) {
    const specializationBuilder = this.db
      .select({
        id: specialization.id,
        majorId: specialization.majorId,
        name: specialization.name,
      })
      .from(specialization);

    if (query.majorId) {
      specializationBuilder.where(eq(specialization.majorId, query.majorId));
    }

    return specializationBuilder;
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
