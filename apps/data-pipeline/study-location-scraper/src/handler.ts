import { database } from "@packages/db";
import { doSpringshareScrape } from "$lib";
import { doPVScrape } from "./pv";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    let springshareError: unknown = null;
    let pvError: unknown = null;
    try {
      await doSpringshareScrape(db);
    } catch (err) {
      springshareError = err;
      console.error("Libraries + ALP scrape failed:", err);
    }
    try {
      await doPVScrape(db);
    } catch (err) {
      pvError = err;
      console.error("PV scrape failed:", err);
    }
    await db.$client.end();
    if (springshareError || pvError) {
      throw new Error("One or more scrapes failed");
    }
  },
} satisfies ExportedHandler<Env>;
