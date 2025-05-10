import type { libraryTrafficQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { libraryTraffic } from "@packages/db/schema";
import type { z } from "zod";

type LibraryTrafficServiceInput = z.infer<typeof libraryTrafficQuerySchema>;
type LibraryTrafficServiceOutput = typeof libraryTraffic.$inferSelect;

export class LibraryTrafficService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getLibraryTraffic(
    input: LibraryTrafficServiceInput,
  ): Promise<LibraryTrafficServiceOutput[]> {
    return await this.db
      .select({
        id: libraryTraffic.id,
        locationName: libraryTraffic.locationName,
        trafficCount: libraryTraffic.trafficCount,
        trafficPercentage: libraryTraffic.trafficPercentage,
        timestamp: libraryTraffic.timestamp,
      })
      .from(libraryTraffic)
      .where(input.locationName ? eq(libraryTraffic.locationName, input.locationName) : undefined);
  }
}
