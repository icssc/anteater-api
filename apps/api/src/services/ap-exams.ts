import type { database } from "@packages/db";
import { apExams } from "@packages/db/schema";

export class apExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getAPExams() {
    return this.db
      .select({ catalogueName: apExams.id, officialName: apExams.officialName })
      .from(apExams);
  }
}
