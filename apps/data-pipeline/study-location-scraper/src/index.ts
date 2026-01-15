import { exit } from "node:process";
import { doScrape as doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doScrape as doPVScrape } from "./pv";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  await Promise.all([doLibraryScrape(db), doPVScrape(db)]);
  exit(0);
}

main().then();
