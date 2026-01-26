import type { database } from "@packages/db";
import { updateEvents } from "./update-events.ts";
import { updateRestaurant } from "./update-restaurant.ts";

export async function doScrape(db: ReturnType<typeof database>) {
  await updateEvents(db);

  const today = new Date();
  await updateRestaurant(db, today, "anteatery");
  await updateRestaurant(db, today, "brandywine");
  console.log("All done!");
}
