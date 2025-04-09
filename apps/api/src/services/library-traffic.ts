import type { database } from "@packages/db";
import { libraryTraffic } from "@packages/db/schema";

export class LibraryTrafficService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getLatestTrafficData() {
    const data = await this.db.select().from(libraryTraffic);
    // .orderBy(desc(libraryTraffic.timestamp));

    return data.map((entry) => ({
      ...entry,
      traffic_percentage: Number(entry.traffic_percentage),
      timestamp: entry.timestamp.toISOString(),
    }));
  }
}
