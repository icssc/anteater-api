import type { database } from "@packages/db";
import type { InsertRestaurant, RestaurantId } from "@packages/db/schema";
import { restaurants } from "@packages/db/schema";
import { upsert } from "./utils";

export const upsertRestaurant = async (
  db: ReturnType<typeof database>,
  restaurant: InsertRestaurant,
) =>
  await upsert(db, restaurants, restaurant, {
    target: restaurants.id,
    set: restaurant,
  });

/**
 * Upserts both restaurants
 */
export async function upsertAllRestaurants(db: ReturnType<typeof database>): Promise<void> {
  const restaurantData: Array<{ id: RestaurantId; name: "anteatery" | "brandywine" }> = [
    { id: "3056", name: "brandywine" },
    { id: "3314", name: "anteatery" },
  ];

  const results = await Promise.allSettled(restaurantData.map((r) => upsertRestaurant(db, r)));

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to upsert restaurant:", result.reason);
    }
  }

  console.log(`Upserted ${restaurantData.length} restaurants`);
}
