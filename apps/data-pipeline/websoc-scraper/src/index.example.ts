import { exit } from "node:process";
import { database } from "@packages/db";

/**
 * You will probably want to test the scraper in multiple scenarios locally.
 *
 * To do so, copy this file to `index.ts`, make any changes there, then run `pnpm start`.
 *
 * `index.ts` is ignored, so no need to worry about your testing process being made public :)
 */
async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  // biome-ignore lint/correctness/noUnusedVariables: example code is an example
  const db = database(url);
  // do something...
  exit(0);
}

main().then();
