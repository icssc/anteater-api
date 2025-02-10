import type { apExamsQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { apExams } from "@packages/db/schema";

import type { z } from "zod";

export class apExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getAPExams(query: z.infer<typeof apExamsQuerySchema>) {
    return this.db
      .select({ catalogueName: apExams.id, officialName: apExams.officialName })
      .from(apExams)
      .where(query?.id ? eq(apExams.id, query.id) : undefined);
  }
}
