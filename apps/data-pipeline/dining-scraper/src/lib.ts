import type { database } from "@packages/db";
import { updateRestaurant } from "./update-restaurant.ts";

export async function doScrape(db: ReturnType<typeof database>) {
  // eventJob

  const today = new Date();

  console.log("[weekly] Starting Brandywine and Anteatery Menu jobs...");
  await Promise.all([
    updateRestaurant(db, today, "brandywine"),
    updateRestaurant(db, today, "anteatery"),
  ]);
  console.log("[weekly] Finished Brandywine and Anteatery Menu jobs.");
}
