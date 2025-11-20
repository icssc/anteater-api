import { exit } from "node:process";
import { database } from "@packages/db";
import { doScrape } from "./lib";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  await doScrape(db);
  exit(0);
}

main().then();
