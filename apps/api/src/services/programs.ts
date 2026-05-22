import type { database } from "@packages/db";
import { and, eq, sql } from "@packages/db/drizzle";
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

  private catalogYearModifiers(
    table:
      | typeof dwSchoolRequirement
      | typeof dwMajorYear
      | typeof dwMajorSpecializationToRequirement
      | typeof dwMinorRequirement
      | typeof dwSpecializationRequirement,
    catalogYear: string | undefined,
  ) {
    return [
      catalogYear !== undefined ? eq(table.catalogYear, catalogYear) : undefined,
      catalogYear !== undefined
        ? sql`CASE
  WHEN ${table.catalogYear} > ${catalogYear} THEN SUBSTRING(${table.catalogYear} FROM 1 FOR 4)::real - SUBSTRING(${catalogYear} FROM 1 FOR 4)::real
  WHEN ${table.catalogYear} = ${catalogYear} THEN 0
  WHEN ${table.catalogYear} < ${catalogYear} THEN SUBSTRING(${catalogYear} FROM 1 FOR 4)::real - SUBSTRING(${table.catalogYear} FROM 1 FOR 4)::real + 0.5
  END`
        : undefined,
    ];
  }

  async getMajors(query: z.infer<typeof majorsQuerySchema>) {
    const [specsWhere, specsOrder] = this.catalogYearModifiers(
      dwMajorSpecializationToRequirement,
      query.catalogYear,
    );

    const majorSpecializationInner = this.db
      .select({
        id: dwMajor.id,
        name: dwMajor.name,
        catalogYear: dwMajorSpecializationToRequirement.catalogYear,
        specializations:
          sql`ARRAY_REMOVE(ARRAY_AGG(${dwMajorSpecializationToRequirement.specializationId}), NULL)`.as(
            "specializations",
          ),
      })
      .from(dwMajor)
      .leftJoin(
        dwMajorSpecializationToRequirement,
        eq(dwMajor.id, dwMajorSpecializationToRequirement.majorId),
      )
      .where(specsWhere);

    const majorSpecialization = this.db
      .$with("major_specialization")
      .as(
        (specsOrder !== undefined
          ? majorSpecializationInner.orderBy(specsOrder)
          : majorSpecializationInner
        ).groupBy(dwMajor.id, dwMajorSpecializationToRequirement.catalogYear),
      );

    return this.db
      .with(majorSpecialization)
      .select({
        id: majorSpecialization.id,
        name: majorSpecialization.name,
        catalogYear: majorSpecialization.catalogYear,
        specializationRequired: dwMajorYear.specializationRequired,
        specializations: majorSpecialization.specializations,
        type: dwDegree.name,
        division: dwDegree.division,
      })
      .from(majorSpecialization)
      .innerJoin(dwMajor, eq(majorSpecialization.id, dwMajor.id))
      .innerJoin(dwDegree, eq(dwMajor.degreeId, dwDegree.id))
      .innerJoin(
        dwMajorYear,
        and(
          eq(dwMajor.id, dwMajorYear.programId),
          eq(majorSpecialization.catalogYear, dwMajorYear.catalogYear),
        ),
      )
      .where(and(query.id ? eq(majorSpecialization.id, query.id) : undefined));
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
      const [where, order] = this.catalogYearModifiers(
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
        .innerJoin(
          dwMajorSpecializationToRequirement,
          eq(dwMajor.id, dwMajorSpecializationToRequirement.majorId),
        )
        .innerJoin(
          dwMajorRequirement,
          eq(dwMajorSpecializationToRequirement.requirementId, dwMajorRequirement.id),
        )
        .innerJoin(dwMajorYear, eq(dwMajor.id, dwMajorYear.programId))
        .where(
          and(
            eq(dwMajor.id, query.programId),
            query.specializationId
              ? eq(dwMajorSpecializationToRequirement.specializationId, query.specializationId)
              : undefined,
            where,
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

    const [where, order] = this.catalogYearModifiers(requirementsTable, query.catalogYear);

    const base = this.db
      .select({
        id: baseTable.id,
        name: baseTable.name,
        catalogYear: requirementsTable.catalogYear,
        requirements: requirementsTable.requirements,
      })
      .from(baseTable)
      .leftJoin(requirementsTable, eq(baseTable.id, requirementsTable.programId))
      .where(and(eq(baseTable.id, query.programId), where));

    const [got] = await (order !== undefined ? base.orderBy(order) : base).limit(1);
    return orNull(got);
  }

  async getUgradRequirements(query: z.infer<typeof ugradRequirementsQuerySchema>) {
    const [where, order] = this.catalogYearModifiers(dwSchoolRequirement, query.catalogYear);

    const base = this.db
      .select({
        id: dwSchoolRequirement.id,
        requirements: dwSchoolRequirement.requirements,
        catalogYear: dwSchoolRequirement.catalogYear,
      })
      .from(dwSchoolRequirement)
      .where(and(eq(dwSchoolRequirement.id, query.id), where));

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
