import type { database } from "@packages/db";
import { doScrape } from "$lib";

type HumanitiesDatabase = ReturnType<typeof database>;

export async function runStandaloneScrape(
  db: HumanitiesDatabase,
  scrape: (db: HumanitiesDatabase) => Promise<unknown> = doScrape,
): Promise<void> {
  try {
    await scrape(db);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
