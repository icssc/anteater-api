import type { mapQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import { mapLocation } from "@packages/db/schema";
import type { z } from "zod";

export class MapService {
  constructor(private readonly db: ReturnType<typeof database>) {}
  async getLocations(query: z.infer<typeof mapQuerySchema>) {
    return this.db
      .select({
        id: mapLocation.id,
        name: mapLocation.name,
      })
      .from(mapLocation)
      .where(query.id ? eq(mapLocation.id, mapLocation.id) : undefined);
  }
}
