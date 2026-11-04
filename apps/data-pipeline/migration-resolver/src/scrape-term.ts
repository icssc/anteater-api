import { argv, exit } from "node:process";
import { database } from "@packages/db";
import { terms } from "@packages/stdlib";
import { scrapeTerm } from "../../websoc-scraper/src/lib.ts";

type Quarter = (typeof terms)[number];

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const [year, quarter] = argv.slice(2);
  if (!/^\d{4}$/.test(year ?? "") || !terms.includes(quarter as Quarter)) {
    throw new Error(`Usage: scrape-term.ts <year> <${terms.join("|")}>`);
  }

  const db = database(url);
  try {
    await scrapeTerm(db, { year, quarter: quarter as Quarter });
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

main().then(
  () => exit(0),
  (e) => {
    console.error(e);
    exit(1);
  },
);
