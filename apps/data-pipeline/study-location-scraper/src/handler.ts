import { doScrape } from "$lib";
import { database } from "@packages/db";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    await doScrape(db);
    await db.$client.end();
  },
} satisfies ExportedHandler<Env>;
