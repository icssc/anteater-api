import type { database } from "@packages/db";
import { updateEvents } from "./update-events.ts";
import { updateRestaurant } from "./update-restaurant.ts";

export async function doScrape(db: ReturnType<typeof database>) {
  await updateEvents(db);

  const today = new Date();
  console.log("[weekly] Starting Brandywine and Anteatery Menu jobs...");
  await updateRestaurant(db, today, "brandywine");
  await updateRestaurant(db, today, "anteatery");
  console.log("[weekly] Finished Brandywine and Anteatery Menu jobs.");
}
