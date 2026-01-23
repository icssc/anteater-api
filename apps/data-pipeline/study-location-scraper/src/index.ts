import { exit } from "node:process";
import { doScrape as doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doPVScrape } from "./pv";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  const results = await Promise.allSettled([doLibraryScrape(db), doPVScrape(db)]);
  const names = ["Library", "PV"];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`${names[i]} scrape failed:`, r.reason);
    }
  });
  exit(0);
}

main().then();
