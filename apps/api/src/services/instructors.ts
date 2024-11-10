import type { instructorSchema, instructorsQuerySchema } from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import { and, eq, ilike, inArray } from "@packages/db/drizzle";
import { instructorView } from "@packages/db/schema";
import { orNull } from "@packages/stdlib";
import type { z } from "zod";

type InstructorsServiceInput = z.infer<typeof instructorsQuerySchema>;

type InstructorsServiceOutput = z.infer<typeof instructorSchema>;

function buildQuery(input: InstructorsServiceInput) {
  const conditions = [];
  if (input.nameContains) {
    conditions.push(ilike(instructorView.name, `%${input.nameContains}%`));
  }
  if (input.titleContains) {
    conditions.push(ilike(instructorView.title, `%${input.titleContains}%`));
  }
  if (input.departmentContains) {
    conditions.push(ilike(instructorView.department, `%${input.departmentContains}%`));
  }
  return and(...conditions);
}

export class InstructorsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getInstructorsRaw(input: {
    where?: SQL;
    offset?: number;
    limit?: number;
  }) {
    const { where, offset, limit } = input;
    return (await this.db
      .select()
      .from(instructorView)
      .where(where)
      .offset(offset ?? 0)
      .limit(limit ?? 1)) as InstructorsServiceOutput[];
  }

  async getInstructorByUCInetID(ucinetid: string): Promise<InstructorsServiceOutput | null> {
    return this.getInstructorsRaw({
      where: and(eq(instructorView.ucinetid, ucinetid)),
    }).then((xs) => orNull(xs[0]));
  }

  async batchGetInstructors(ucinetids: string[]): Promise<InstructorsServiceOutput[]> {
    return this.getInstructorsRaw({
      where: inArray(instructorView.ucinetid, ucinetids),
      limit: ucinetids.length,
    });
  }

  async getInstructors(input: InstructorsServiceInput): Promise<InstructorsServiceOutput[]> {
    return this.getInstructorsRaw({
      where: buildQuery(input),
      offset: input.skip,
      limit: input.take,
    });
  }
}
