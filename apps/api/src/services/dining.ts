import type { diningEventQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { and, eq, gte } from "@packages/db/drizzle";
import { diningEvent } from "@packages/db/schema";
import type { z } from "zod";

type DiningEventQuery = z.infer<typeof diningEventQuerySchema>;

export class DiningService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getUpcomingEvents(input: DiningEventQuery) {
    // only get events ending after the current time
    const conds = [gte(diningEvent.end, new Date())];

    if (input.restaurantId) {
      conds.push(eq(diningEvent.restaurantId, input.restaurantId));
    }

    return this.db
      .select({
        title: diningEvent.title,
        image: diningEvent.image,
        restaurantId: diningEvent.restaurantId,
        // somewhere it was mentioned that shortDescription is never stored, so don't return it
        longDescription: diningEvent.longDescription,
        start: diningEvent.start,
        end: diningEvent.end,
        // don't return updatedAt field?
      })
      .from(diningEvent)
      .where(and(...conds));
  }
}
