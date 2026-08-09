import { database } from "@packages/db";
import { doAllEducationScrapes } from "$lib";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    await doAllEducationScrapes(db);
  },
} satisfies ExportedHandler<Env>;
