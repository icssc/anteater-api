import type { database } from "@packages/db";
import { upsertMenusForWeek } from "./restaurant";

export async function doScrape(db: ReturnType<typeof database>) {
  // eventJob

  const today = new Date();

  console.log("[weekly] Starting Brandywine and Anteatery Menu jobs...");
  await Promise.all([
    upsertMenusForWeek(db, today, "brandywine"),
    upsertMenusForWeek(db, today, "anteatery"),
  ]);
  console.log("[weekly] Finished Brandywine and Anteatery Menu jobs.");
}
