import { exit } from "node:process";
import { doScrape } from "./lib";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  await doScrape(url);
  exit(0);
}

main().then();
