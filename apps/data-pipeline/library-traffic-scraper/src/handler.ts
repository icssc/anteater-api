import { doScrape } from "./lib";

interface Env {
  DB_URL: string;
}

export default {
  async scheduled(_event: unknown, env: Env): Promise<Response> {
    await doScrape(env.DB_URL);
    return new Response("Library traffic scrape completed");
  },

  async fetch(_request: Request, env: Env): Promise<Response> {
    await doScrape(env.DB_URL);
    return new Response("Manual library traffic scrape completed");
  },
};
