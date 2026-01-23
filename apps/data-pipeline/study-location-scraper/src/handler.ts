import { doScrape as doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doPVScrape } from "./pv";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    const results = await Promise.allSettled([doLibraryScrape(db), doPVScrape(db)]);
    const names = ["Library", "PV"];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`${names[i]} scrape failed:`, r.reason);
      }
    });
    await db.$client.end();
    if (results.some((r) => r.status === "rejected")) {
      throw new Error("One or more scrapes failed");
    }
  },
} satisfies ExportedHandler<Env>;
