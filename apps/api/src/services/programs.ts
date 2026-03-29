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
import { and, eq, max, sql } from "@packages/db/drizzle";
import {
  catalogProgram,
  dwCollegeRequirement,
  dwDegree,
  dwMajor,
  dwMajorRequirement,
  dwMinor,
  dwMinorRequirement,
  dwSchool,
  dwSpecialization,
  dwSpecializationRequirement,
  sampleProgramVariation,
} from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";

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

    const conds = [];
    if (query.id) {
      conds.push(eq(majorSpecialization.id, query.id));
    }
    conds.push(
      eq(
        dwMajorRequirement.catalogYear,
        query.catalogYear ??
          this.db
            .select({ m: max(dwMajorRequirement.catalogYear).as("m") })
            .from(dwMajorRequirement),
      ),
    );

    return (
      this.db
        .with(majorSpecialization)
        .select({
          id: majorSpecialization.id,
          name: majorSpecialization.name,
          specializationRequired: dwMajorRequirement.specializationRequired,
          specializations: majorSpecialization.specializations,
          type: dwDegree.name,
          division: dwDegree.division,
        })
        .from(majorSpecialization)
        .where(and(...conds))
        .innerJoin(dwMajor, eq(majorSpecialization.id, dwMajor.id))
        .innerJoin(dwDegree, eq(dwMajor.degreeId, dwDegree.id))
        // if a major hasn't appeared in any catalog year, we don't want it anyway
        .innerJoin(dwMajorRequirement, eq(dwMajor.id, dwMajorRequirement.programId))
    );
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
    const table = {
      major: dwMajor,
      minor: dwMinor,
      specialization: dwSpecialization,
    }[programType];
    const requirementTable = {
      major: dwMajorRequirement,
      minor: dwMinorRequirement,
      specialization: dwSpecializationRequirement,
    }[programType];

    const [got] = await (programType !== "major"
      ? this.db
          .select({ id: table.id, name: table.name, requirements: requirementTable.requirements })
          .from(table)
          .innerJoin(requirementTable, eq(table.id, requirementTable.programId))
      : this.db
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
          .innerJoin(dwMajorRequirement, eq(dwMajor.id, dwMajorRequirement.programId))
          .leftJoin(
            dwCollegeRequirement,
            eq(dwMajorRequirement.collegeRequirement, dwCollegeRequirement.id),
          )
    )
      .where(
        and(
          eq(table.id, query.programId),
          eq(
            requirementTable.catalogYear,
            query.catalogYear ??
              this.db
                .select({ m: max(requirementTable.catalogYear).as("m") })
                .from(requirementTable),
          ),
        ),
      )
      .limit(1);

    return orNull(got);
  }

  async getUgradRequirements(query: z.infer<typeof ugradRequirementsQuerySchema>) {
    const [got] = await this.db
      .select({
        id: dwSchool.id,
        requirements: dwSchool.requirements,
      })
      .from(dwSchool)
      .where(eq(dwSchool.id, query.id))
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
