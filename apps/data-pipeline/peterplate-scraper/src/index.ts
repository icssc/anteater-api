import { exit } from "node:process";
import { database } from "@packages/db";
import { scrapeStations } from "./lib";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

  await scrapeStations(db, "brandywine");
  exit(0);
}

main().then();
