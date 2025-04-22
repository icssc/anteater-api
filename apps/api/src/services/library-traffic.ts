import type { libraryTrafficQuerySchema, libraryTrafficSchema } from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { libraryTraffic } from "@packages/db/schema";
import type { z } from "zod";

type LibraryTrafficServiceInput = z.infer<typeof libraryTrafficQuerySchema>;

type LibraryTrafficServiceOutput = z.infer<typeof libraryTrafficSchema>;

const transformTrafficRow = (
  row: typeof libraryTraffic.$inferSelect,
): LibraryTrafficServiceOutput => ({
  id: row.id,
  locationName: row.locationName,
  trafficCount: row.trafficCount,
  trafficPercentage: Number(row.trafficPercentage),
  timestamp: row.timestamp.toISOString(),
});

export class LibraryTrafficService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getLibraryTraffic(
    input: LibraryTrafficServiceInput,
  ): Promise<LibraryTrafficServiceOutput[]> {
    const rows = await this.db
      .select()
      .from(libraryTraffic)
      .where(input.locationName ? eq(libraryTraffic.locationName, input.locationName) : undefined);

    return rows.map(transformTrafficRow);
  }
}
