import type { libraryTrafficQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { and, eq } from "@packages/db/drizzle";
import { libraryTraffic } from "@packages/db/schema";
import type { z } from "zod";

type LibraryTrafficServiceInput = z.infer<typeof libraryTrafficQuerySchema>;

export class LibraryTrafficService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  getLibraryTraffic(input: LibraryTrafficServiceInput) {
    const queryParams = [];

    if (input.libraryName) {
      queryParams.push(eq(libraryTraffic.libraryName, input.libraryName));
    }

    if (input.locationName) {
      queryParams.push(eq(libraryTraffic.locationName, input.locationName));
    }

    return this.db
      .select({
        id: libraryTraffic.id,
        libraryName: libraryTraffic.libraryName,
        locationName: libraryTraffic.locationName,
        trafficCount: libraryTraffic.trafficCount,
        trafficPercentage: libraryTraffic.trafficPercentage,
        timestamp: libraryTraffic.timestamp,
      })
      .from(libraryTraffic)
      .where(queryParams.length ? and(...queryParams) : undefined);
  }
}
