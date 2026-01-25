import { doScrape } from "$lib";
import { database } from "@packages/db";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  await doScrape(db);
}

main().then();
