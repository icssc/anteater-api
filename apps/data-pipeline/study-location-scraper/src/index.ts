import { exit } from "node:process";
import { doLibraryScrape } from "$lib";
import { database } from "@packages/db";
import { doPVScrape } from "./pv";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  let libraryError: unknown = null;
  let pvError: unknown = null;
  try {
    await doLibraryScrape(db);
  } catch (err) {
    libraryError = err;
    console.error("Libraries scrape failed:", err);
  }
  try {
    await doPVScrape(db);
  } catch (err) {
    pvError = err;
    console.error("PV scrape failed:", err);
  }
  exit(libraryError || pvError ? 1 : 0);
}

main().then();
