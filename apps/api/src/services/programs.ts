import type {
  majorRequirementsQuerySchema,
  minorRequirementsQuerySchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { major, minor, specialization } from "@packages/db/schema";
import type { z } from "zod";

export class ProgramsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

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
      .select({ id: table.id, requirements: table.requirements })
      .from(table)
      .where(eq(table.id, query.program_id))
      .limit(1);

    if (!got) {
      return null;
    }

    return { id: got.id, requirements: got.requirements };
  }
}
