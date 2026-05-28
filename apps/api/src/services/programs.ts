import type { database } from "@packages/db";
import { and, eq, inArray, type SQL, sql } from "@packages/db/drizzle";
import {
  catalogProgram,
  dwDegree,
  dwMajor,
  dwMajorRequirement,
  dwMajorSpecializationToRequirement,
  dwMajorYear,
  dwMinor,
  dwMinorRequirement,
  dwSchoolRequirement,
  dwSpecialization,
  dwSpecializationRequirement,
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

  // for any table with catalogYear column, build a score as follows:
  // - if a catalog year not specified, do whatever postgres feels like
  // - if a catalog year is specified, order the returned years as follows:
  //   - prefer an exact match best
  //   - otherwise, prioritize years based on absolute difference, but in the case of two equidistant years
  //     (in opposite directions), prefer the more recent one
  private catalogYearPriorityExpression(
    table:
      | typeof dwSchoolRequirement
      | typeof dwMajorYear
      | typeof dwMajorSpecializationToRequirement
      | typeof dwMinorRequirement
      | typeof dwSpecializationRequirement,
    catalogYear: string | undefined,
  ) {
    return catalogYear !== undefined
      ? sql`CASE
  WHEN ${table.catalogYear} > ${catalogYear} THEN SUBSTRING(${table.catalogYear} FROM 1 FOR 4)::real - SUBSTRING(${catalogYear} FROM 1 FOR 4)::real
  WHEN ${table.catalogYear} = ${catalogYear} THEN 0
  WHEN ${table.catalogYear} < ${catalogYear} THEN SUBSTRING(${catalogYear} FROM 1 FOR 4)::real - SUBSTRING(${table.catalogYear} FROM 1 FOR 4)::real + 0.5
  END`
      : undefined;
  }

  async getMajors(query: z.infer<typeof majorsQuerySchema>) {
    return await this.db
      .select({
        id: dwMajor.id,
        name: dwMajor.name,
        catalogYear: dwMajorYear.catalogYear,
        specializationRequired: dwMajorYear.specializationRequired,
        specializations:
          sql`ARRAY_REMOVE(ARRAY_AGG(${dwMajorSpecializationToRequirement.specializationId}), NULL)`.as(
            "specializations",
          ),
        type: dwDegree.name,
        division: dwDegree.division,
      })
      .from(dwMajor)
      .innerJoin(dwDegree, eq(dwMajor.degreeId, dwDegree.id))
      .innerJoin(dwMajorYear, eq(dwMajor.id, dwMajorYear.programId))
      .innerJoin(
        dwMajorSpecializationToRequirement,
        and(
          eq(dwMajor.id, dwMajorSpecializationToRequirement.majorId),
          eq(dwMajorYear.catalogYear, dwMajorSpecializationToRequirement.catalogYear),
        ),
      )
      .groupBy(dwMajor.id, dwMajorSpecializationToRequirement.catalogYear)
      .where(
        and(
          query.id ? eq(dwMajor.id, query.id) : undefined,
          query.catalogYear
            ? inArray(
                dwMajorYear.catalogYear,
                this.db
                  .select({ best: dwMajorYear.catalogYear })
                  .from(dwMajorYear)
                  .where(and(query.id ? eq(dwMajorYear.programId, query.id) : undefined))
                  .orderBy(
                    this.catalogYearPriorityExpression(
                      dwMajorYear,
                      query.catalogYear,
                    ) as SQL<unknown>,
                  )
                  .limit(1)
                  .as("best_year"),
              )
            : undefined,
        ),
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
      .selectDistinct({
        id: dwSpecialization.id,
        majorId: dwSpecialization.majorId,
        name: dwSpecialization.name,
      })
      .from(dwSpecialization)
      .leftJoin(
        dwMajorSpecializationToRequirement,
        and(
          eq(dwSpecialization.majorId, dwMajorSpecializationToRequirement.majorId),
          eq(dwSpecialization.id, dwMajorSpecializationToRequirement.specializationId),
        ),
      )
      .where(
        and(
          query.majorId ? eq(dwSpecialization.majorId, query.majorId) : undefined,
          query.catalogYear
            ? inArray(
                dwMajorSpecializationToRequirement.catalogYear,
                this.db
                  .select({ best: dwMajorSpecializationToRequirement.catalogYear })
                  .from(dwMajorSpecializationToRequirement)
                  .where(
                    and(
                      query.majorId
                        ? eq(dwMajorSpecializationToRequirement.majorId, query.majorId)
                        : undefined,
                    ),
                  )
                  .orderBy(
                    this.catalogYearPriorityExpression(
                      dwMajorSpecializationToRequirement,
                      query.catalogYear,
                    ) as SQL<unknown>,
                  )
                  .limit(1)
                  .as("best_year"),
              )
            : undefined,
        ),
      );
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
      const order = this.catalogYearPriorityExpression(
        dwMajorSpecializationToRequirement,
        query.catalogYear,
      );

      const base = this.db
        .select({
          id: dwMajor.id,
          name: dwMajor.name,
          catalogYear: dwMajorYear.catalogYear,
          requirements: dwMajorRequirement.requirements,
          schoolRequirements: {
            name: dwMajorYear.collegeRequirements,
            requirements: dwMajorYear.collegeRequirementsTitle,
          },
        })
        .from(dwMajor)
        .innerJoin(dwMajorYear, eq(dwMajor.id, dwMajorYear.programId))
        .innerJoin(
          dwMajorSpecializationToRequirement,
          and(
            eq(dwMajor.id, dwMajorSpecializationToRequirement.majorId),
            eq(dwMajorYear.catalogYear, dwMajorSpecializationToRequirement.catalogYear),
          ),
        )
        .innerJoin(
          dwMajorRequirement,
          eq(dwMajorSpecializationToRequirement.requirementId, dwMajorRequirement.id),
        )
        .where(
          and(
            eq(dwMajor.id, query.programId),
            query.specializationId
              ? eq(dwMajorSpecializationToRequirement.specializationId, query.specializationId)
              : undefined,
          ),
        );
      const [got] = await (order !== undefined ? base.orderBy(order) : base).limit(1);

      const converted =
        got !== undefined
          ? {
              ...got,
              schoolRequirements:
                got.schoolRequirements.requirements !== null ? got.schoolRequirements : null,
            }
          : undefined;

      return orNull(converted);
    }

    const [baseTable, requirementsTable] = {
      minor: [dwMinor, dwMinorRequirement] as const,
      specialization: [dwSpecialization, dwSpecializationRequirement] as const,
    }[programType];

    const order = this.catalogYearPriorityExpression(requirementsTable, query.catalogYear);

    const base = this.db
      .select({
        id: baseTable.id,
        name: baseTable.name,
        catalogYear: requirementsTable.catalogYear,
        requirements: requirementsTable.requirements,
      })
      .from(baseTable)
      .leftJoin(requirementsTable, eq(baseTable.id, requirementsTable.programId))
      .where(eq(baseTable.id, query.programId));

    const [got] = await (order !== undefined ? base.orderBy(order) : base).limit(1);
    return orNull(got);
  }

  async getUgradRequirements(query: z.infer<typeof ugradRequirementsQuerySchema>) {
    const order = this.catalogYearPriorityExpression(dwSchoolRequirement, query.catalogYear);

    const base = this.db
      .select({
        id: dwSchoolRequirement.id,
        requirements: dwSchoolRequirement.requirements,
        catalogYear: dwSchoolRequirement.catalogYear,
      })
      .from(dwSchoolRequirement)
      .where(eq(dwSchoolRequirement.id, query.id));

    const [got] = await (order !== undefined ? base.orderBy(order) : base).limit(1);
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
