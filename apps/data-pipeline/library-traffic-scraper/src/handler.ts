import { doScrape } from "./lib";

interface Env {
  DB_URL: string;
}

export default {
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    await doScrape(env.DB_URL);
  },
  async fetch(_: Request, env: Env): Promise<Response> {
    await doScrape(env.DB_URL);
    return new Response("Scrape completed successfully", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
