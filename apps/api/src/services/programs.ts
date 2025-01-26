import type {
  majorRequirementsQuerySchema,
  minorRequirementsQuerySchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { major, minor, specialization } from "@packages/db/schema";
import type { z } from "zod";

type SelectFields =
  | {
      id: typeof major.id;
      degreeId: typeof major.degreeId;
      code: typeof major.code;
      name: typeof major.name;
    }
  | { id: typeof minor.id; name: typeof minor.name }
  | {
      id: typeof specialization.id;
      majorId: typeof specialization.majorId;
      name: typeof specialization.name;
    };

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  // TODO: add query lines
  async getPrograms(programType: "major" | "minor" | "specialization" | "all") {
    let table: typeof major | typeof minor | typeof specialization;
    let selectFields: SelectFields;

    switch (programType) {
      case "major":
        table = major;
        selectFields = {
          id: major.id,
          degreeId: major.degreeId,
          code: major.code,
          name: major.name,
        };
        break;
      case "minor":
        table = minor;
        selectFields = { id: minor.id, name: minor.name };
        break;
      case "specialization":
        table = specialization;
        selectFields = {
          id: specialization.id,
          majorId: specialization.majorId,
          name: specialization.name,
        };
        break;
      default:
        return null;
    }

    const programQuery = this.db.select(selectFields).from(table);

    const programs = await programQuery;

    if (!programs) {
      return null;
    }

    return programs.map((program) => ({
      ...program,
      name: program.name.split(" ").slice(2).join(" "),
    }));
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
