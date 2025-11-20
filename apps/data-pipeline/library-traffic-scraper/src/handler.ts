import { database } from "@packages/db";
import { doScrape } from "./lib";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    await doScrape(db);
  },
} satisfies ExportedHandler<Env>;
