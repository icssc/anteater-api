import { doScrape as doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doPVScrape } from "./pv";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    await Promise.allSettled([doLibraryScrape(db), doPVScrape(db)]);
    await db.$client.end();
  },
} satisfies ExportedHandler<Env>;
