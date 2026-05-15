import { exit } from "node:process";
import { database } from "@packages/db";
import { calendarTerm } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { sleep } from "@packages/stdlib";
import { load } from "cheerio";
import fetch from "cross-fetch";
import { diffString } from "json-diff";
import readlineSync from "readline-sync";
import sortKeys from "sort-keys";

const FIRST_YEAR = 2009;
const LAST_YEAR = 2098;

const deepSortArray = <T extends unknown[]>(array: T): T => sortKeys(array, { deep: true });

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const terms = ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"] as const;

const SOC_AVAIL = /schedule of classes available/i;
const INST_START = /instruction begins/i;
const INST_END = /instruction ends/i;
const FINALS = /final examinations/i;
const HYPHEN = /[-–]/;

const parseDate = (year: number, dateString: string) =>
  new Date(
    Date.UTC(
      year,
      months.indexOf(dateString.split(" ")[0]),
      Number.parseInt(dateString.split(" ")[1], 10),
    ),
  );

const parseDateRange = (year: number, dateRangeString: string): [Date, Date] => [
  new Date(
    Date.UTC(
      year,
      months.indexOf(dateRangeString.split(" ")[0]),
      Number.parseInt(dateRangeString.split(" ")[1].split(HYPHEN)[0], 10),
    ),
  ),
  dateRangeString.split(HYPHEN)[1]?.match(/[A-Za-z]/)
    ? new Date(
        Date.UTC(
          year,
          months.indexOf(dateRangeString.split(HYPHEN)[1].split(" ")[0]),
          Number.parseInt(dateRangeString.split(HYPHEN)[1].split(" ")[1], 10),
        ),
      )
    : new Date(
        Date.UTC(
          year,
          months.indexOf(dateRangeString.split(" ")[0]),
          Number.parseInt(
            dateRangeString.split(" ")[1].split(HYPHEN)[1] ??
              dateRangeString.split(" ")[1].split(HYPHEN)[0],
            10,
          ),
        ),
      ),
];

type TermDateData = {
  year: string;
  quarter: (typeof terms)[number];
  instructionStart: Date;
  instructionEnd: Date;
  finalsStart: Date;
  finalsEnd: Date;
  socAvailable: Date;
};

async function getTermDateData(year: string): Promise<TermDateData[]> {
  const yearNum = Number.parseInt(year, 10);

  if (year.length !== 4 || Number.isNaN(Number.parseInt(year, 10))) {
    throw new Error("Error: Invalid year provided.");
  }

  const shortYear = year.slice(2);

  const response = await fetch(
    `https://www.reg.uci.edu/calendars/quarterly/${year}-${
      Number.parseInt(year, 10) + 1
    }/quarterly${shortYear}-${Number.parseInt(shortYear, 10) + 1}.html`,
  );

  if (response.status === 404) {
    return [];
  }
  const data = load(await response.text())("table.calendartable")
    .text()
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length);

  const socIdx = data.findIndex((x) => x.match(SOC_AVAIL)) + 1;
  const socSummerIdx = data.findLastIndex((x) => x.match(SOC_AVAIL)) + 1;
  const instStartIdx = data.findIndex((x) => x.match(INST_START)) + 1;
  const instStartSummerIdx = data.findLastIndex((x) => x.match(INST_START)) + 1;
  const instEndIdx = data.findIndex((x) => x.match(INST_END)) + 1;
  const instEndSummerIdx = data.findLastIndex((x) => x.match(INST_END)) + 1;
  const finalsIdx = data.findIndex((x) => x.match(FINALS)) + 1;
  const finalsSummerIdx = data.findLastIndex((x) => x.match(FINALS)) + 1;

  const term = (i: number) => `${yearNum + Number(i > 0)} ${terms[i]}`;

  const soc: Record<string, Date> = Object.fromEntries(
    [...data.slice(socIdx, socIdx + 3), ...data.slice(socSummerIdx, socSummerIdx + 3)].map(
      (x, i) => [term(i), parseDate(yearNum + Number(i > 1), x)],
    ),
  );
  const instStart: Record<string, Date> = Object.fromEntries(
    [
      ...data.slice(instStartIdx, instStartIdx + 3),
      ...data.slice(instStartSummerIdx, instStartSummerIdx + 3),
    ].map((x, i) => [term(i), parseDate(yearNum + Number(i > 0), x)]),
  );
  const instEnd: Record<string, Date> = Object.fromEntries(
    [
      ...data.slice(instEndIdx, instEndIdx + 3),
      ...data.slice(instEndSummerIdx, instEndSummerIdx + 3),
    ].map((x, i) => [term(i), parseDate(yearNum + Number(i > 0), x)]),
  );
  const finals: Record<string, [Date, Date]> = Object.fromEntries(
    [
      ...data.slice(finalsIdx, finalsIdx + 3),
      ...data.slice(finalsSummerIdx, finalsSummerIdx + 3),
    ].map((x, i) => [term(i), parseDateRange(yearNum + Number(i > 0), x)]),
  );

  return Array(6)
    .fill(0)
    .map((_, i) => term(i))
    .map((x) => {
      const [year, q] = x.split(" ", 2);
      return {
        year,
        quarter: q as (typeof terms)[number],
        instructionStart: instStart[x],
        instructionEnd: instEnd[x],
        finalsStart: finals[x][0],
        finalsEnd: finals[x][1],
        socAvailable: soc[x],
      };
    });
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  console.log("Scraping calendar terms...");
  const values: TermDateData[] = [];
  for (let i = FIRST_YEAR; i <= LAST_YEAR; ++i) {
    const data = await getTermDateData(i.toString(10));
    if (!data.length) break;
    values.push(...data);
    await sleep(1000);
  }
  const sortedValues = deepSortArray(values);
  console.log("Fetching calendar terms in the database...");
  const dbValues = deepSortArray(await db.select().from(calendarTerm));
  const diff = diffString(dbValues, sortedValues);
  if (!diff.length) {
    console.log("No difference found between database and scraped calendar term data.");
    console.log("All done!");
    exit();
  }
  console.log("Difference between database and scraped calendar term data:");
  console.log(diff);
  if (!readlineSync.keyInYNStrict("Is this ok")) {
    console.log("Cancelling scraping run.");
    exit(1);
  }
  console.log("Writing scraped data to database...");
  await db
    .insert(calendarTerm)
    .values(values)
    .onConflictDoUpdate({
      target: [calendarTerm.id],
      set: conflictUpdateSetAllCols(calendarTerm),
    });
  console.log("All done!");
  exit();
}

main().then();
