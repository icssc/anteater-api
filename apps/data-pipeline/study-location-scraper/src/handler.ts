import { doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doPVScrape } from "./pv";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    let libraryError: unknown = null;
    let pvError: unknown = null;
    try {
      await doLibraryScrape(db);
    } catch (err) {
      libraryError = err;
      console.error("Libraries scrape failed:", err);
    }
    try {
      await doPVScrape(db);
    } catch (err) {
      pvError = err;
      console.error("PV scrape failed:", err);
    }
    await db.$client.end();
    if (libraryError || pvError) {
      throw new Error("One or more scrapes failed");
    }
  },
} satisfies ExportedHandler<Env>;
