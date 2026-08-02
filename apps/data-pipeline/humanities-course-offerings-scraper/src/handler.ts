import { database } from "@packages/db";
import { doScrape } from "$lib";

export default {
  async scheduled(_, env) {
    await doScrape(database(env.DB.connectionString));
  },
} satisfies ExportedHandler<Env>;
