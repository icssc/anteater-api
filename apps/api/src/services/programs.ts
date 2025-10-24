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
import { eq, inArray, sql } from "@packages/db/drizzle";
import {
  catalogProgram,
  collegeRequirement,
  degree,
  major,
  minor,
  sampleProgramVariation,
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
          specializations: sql`ARRAY_REMOVE(ARRAY_AGG(${specialization.id}), NULL)`.as(
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

    const [got] = await (programType !== "major"
      ? this.db
          .select({ id: table.id, name: table.name, requirements: table.requirements })
          .from(table)
      : this.db
          .select({
            id: major.id,
            name: major.name,
            requirements: major.requirements,
            schoolRequirements: {
              name: collegeRequirement.name,
              requirements: collegeRequirement.requirements,
            },
          })
          .from(major)
          .leftJoin(collegeRequirement, eq(major.collegeRequirement, collegeRequirement.id))
    )
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
    // Get catalog programs with their variations
    const catalogPrograms = await this.db
      .select({
        id: catalogProgram.id,
        programName: catalogProgram.programName,
      })
      .from(catalogProgram)
      .where(query.id ? eq(catalogProgram.id, query.id) : undefined);

    // Get all variations for these programs
    const programIds = catalogPrograms.map((p) => p.id);
    const variations = programIds.length
      ? await this.db
          .select({
            programId: sampleProgramVariation.programId,
            variationId: sampleProgramVariation.id,
            label: sampleProgramVariation.label,
            sampleProgram: sampleProgramVariation.sampleProgram,
            variationNotes: sampleProgramVariation.variationNotes,
          })
          .from(sampleProgramVariation)
          .where(inArray(sampleProgramVariation.programId, programIds))
      : [];

    // Combine them
    return catalogPrograms.map((program) => ({
      id: program.id,
      programName: program.programName,
      variations: variations
        .filter((v) => v.programId === program.id)
        .map((v) => ({
          id: v.variationId,
          ...(v.label && { label: v.label }),
          sampleProgram: v.sampleProgram,
          notes: v.variationNotes,
        })),
    }));
  }
}
