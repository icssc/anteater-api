import type { database } from "@packages/db";
import { and, eq, sql } from "@packages/db/drizzle";
import {
  catalogProgram,
  dwCollegeRequirement,
  dwDegree,
  dwMajor,
  dwMajorRequirement,
  dwMajorSpecializationToRequirement,
  dwMinor,
  dwSchoolRequirement,
  dwSpecialization,
  sampleProgramVariation,
} from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";
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

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getMajors(query: z.infer<typeof majorsQuerySchema>) {
    const majorSpecialization = this.db.$with("major_specialization").as(
      this.db
        .select({
          id: dwMajor.id,
          name: dwMajor.name,
          specializations: sql`ARRAY_REMOVE(ARRAY_AGG(${dwSpecialization.id}), NULL)`.as(
            "specializations",
          ),
        })
        .from(dwMajor)
        .leftJoin(dwSpecialization, eq(dwMajor.id, dwSpecialization.majorId))
        .groupBy(dwMajor.id),
    );

    return this.db
      .with(majorSpecialization)
      .select({
        id: majorSpecialization.id,
        name: majorSpecialization.name,
        specializationRequired: dwMajor.specializationRequired,
        specializations: majorSpecialization.specializations,
        type: dwDegree.name,
        division: dwDegree.division,
      })
      .from(majorSpecialization)
      .where(query.id ? eq(majorSpecialization.id, query.id) : undefined)
      .innerJoin(dwMajor, eq(majorSpecialization.id, dwMajor.id))
      .innerJoin(dwDegree, eq(dwMajor.degreeId, dwDegree.id));
  }

  async getMinors(query: z.infer<typeof minorsQuerySchema>) {
    return this.db
      .select({
        id: dwMinor.id,
        name: dwMinor.name,
      })
      .from(dwMinor)
      .where(query.id ? eq(dwMinor.id, query.id) : undefined);
  }

  async getSpecializations(query: z.infer<typeof specializationsQuerySchema>) {
    return this.db
      .select({
        id: dwSpecialization.id,
        majorId: dwSpecialization.majorId,
        name: dwSpecialization.name,
      })
      .from(dwSpecialization)
      .where(query.majorId ? eq(dwSpecialization.majorId, query.majorId) : undefined);
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
    if (programType === "major") {
      const [got] = await this.db
        .select({
          id: dwMajor.id,
          name: dwMajor.name,
          requirements: dwMajorRequirement.requirements,
          schoolRequirements: {
            name: dwCollegeRequirement.name,
            requirements: dwCollegeRequirement.requirements,
          },
        })
        .from(dwMajor)
        .where(
          and(
            eq(dwMajor.id, query.programId),
            query.specializationId
              ? eq(dwMajorSpecializationToRequirement.specializationId, query.specializationId)
              : undefined,
          ),
        )
        .leftJoin(dwCollegeRequirement, eq(dwMajor.collegeRequirementId, dwCollegeRequirement.id))
        .leftJoin(
          dwMajorSpecializationToRequirement,
          eq(dwMajor.id, dwMajorSpecializationToRequirement.majorId),
        )
        .leftJoin(
          dwMajorRequirement,
          eq(dwMajorSpecializationToRequirement.requirementId, dwMajorRequirement.id),
        )
        .limit(1);
      return orNull(got);
    }

    const table = {
      minor: dwMinor,
      specialization: dwSpecialization,
    }[programType];
    const [got] = await this.db
      .select({ id: table.id, name: table.name, requirements: table.requirements })
      .from(table)
      .where(eq(table.id, query.programId))
      .limit(1);
    return orNull(got);
  }

  async getUgradRequirements(query: z.infer<typeof ugradRequirementsQuerySchema>) {
    const [got] = await this.db
      .select({
        id: dwSchoolRequirement.id,
        requirements: dwSchoolRequirement.requirements,
      })
      .from(dwSchoolRequirement)
      .where(eq(dwSchoolRequirement.id, query.id))
      .limit(1);

    return orNull(got);
  }

  async getSamplePrograms(query: z.infer<typeof sampleProgramsQuerySchema>) {
    return await this.db
      .select({
        id: catalogProgram.id,
        programName: catalogProgram.programName,
        variations: sql`
          COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'label', ${sampleProgramVariation.label},
                'courses', ${sampleProgramVariation.sampleProgram},
                'notes', ${sampleProgramVariation.variationNotes}
              )
              ORDER BY ${sampleProgramVariation.id}
            ) FILTER (WHERE ${sampleProgramVariation.id} IS NOT NULL),
            '[]'::jsonb
          )
        `.as("variations"),
      })
      .from(catalogProgram)
      .leftJoin(sampleProgramVariation, eq(catalogProgram.id, sampleProgramVariation.programId))
      .where(query.id ? eq(catalogProgram.id, query.id) : undefined)
      .groupBy(catalogProgram.id);
  }
}
