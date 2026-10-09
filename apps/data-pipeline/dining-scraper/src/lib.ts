import type { database } from "@packages/db";
import { restaurantIds } from "./model.ts";
import { updateEvents } from "./update-events.ts";
import { updateRestaurant } from "./update-restaurant.ts";

export async function doScrape(db: ReturnType<typeof database>) {
  console.log("Updating events information...");
  await updateEvents(db);

  const today = new Date();
  for (const r of restaurantIds) {
    await updateRestaurant(db, today, r);
  }
  console.log("All done!");
}
