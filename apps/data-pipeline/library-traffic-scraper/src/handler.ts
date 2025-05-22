import { doScrape } from "./lib";

interface Env {
  DB_URL: string;
}

export default {
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    await doScrape(env.DB_URL);
  },
} satisfies ExportedHandler<Env>;
