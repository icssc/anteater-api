import { exit } from "node:process";
import { database } from "@packages/db";
import { doScrape } from "./lib.js";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  try {
    await doScrape(db);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
  exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
