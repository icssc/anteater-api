import type {
  majorRequirementsQuerySchema,
  majorsQuerySchema,
  minorRequirementsQuerySchema,
  minorsQuerySchema,
  sampleProgramsQuerySchema,
  specializationRequirementsQuerySchema,
  specializationsQuerySchema,
  ugradRequirementsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq, sql } from "@packages/db/drizzle";
import {
  degree,
  major,
  minor,
  sampleProgram,
  schoolRequirement,
  specialization,
} from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getMajors(query: z.infer<typeof majorsQuerySchema>) {
    const majorSpecialization = this.db.$with("major_specialization").as(
      this.db
        .select({
          id: major.id,
          name: major.name,
          specializations: sql`array_remove(array_agg(${specialization.id}), NULL)`.as(
            "specializations",
          ),
        })
        .from(major)
        .leftJoin(specialization, eq(major.id, specialization.majorId))
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
      .where(query.id ? eq(majorSpecialization.id, query.id) : undefined)
      .innerJoin(major, eq(majorSpecialization.id, major.id))
      .innerJoin(degree, eq(major.degreeId, degree.id));
  }

  async getMinors(query: z.infer<typeof minorsQuerySchema>) {
    return this.db
      .select({
        id: minor.id,
        name: minor.name,
      })
      .from(minor)
      .where(query.id ? eq(minor.id, query.id) : undefined);
  }

  async getSpecializations(query: z.infer<typeof specializationsQuerySchema>) {
    return this.db
      .select({
        id: specialization.id,
        majorId: specialization.majorId,
        name: specialization.name,
      })
      .from(specialization)
      .where(query.majorId ? eq(specialization.majorId, query.majorId) : undefined);
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

  async getUgradRequirements(query: z.infer<typeof ugradRequirementsQuerySchema>) {
    const [got] = await this.db
      .select({
        id: schoolRequirement.id,
        requirements: schoolRequirement.requirements,
      })
      .from(schoolRequirement)
      .where(eq(schoolRequirement.id, query.id))
      .limit(1);

    return orNull(got);
  }

  async getSamplePrograms(query: z.infer<typeof sampleProgramsQuerySchema>) {
    return this.db
      .select({
        programName: sampleProgram.programName,
        sampleProgram: sampleProgram.sampleProgram,
        notes: sampleProgram.programNotes,
      })
      .from(sampleProgram)
      .where(query.programName ? eq(sampleProgram.programName, query.programName) : undefined);
  }
}
