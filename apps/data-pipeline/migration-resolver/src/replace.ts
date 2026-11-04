import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exit } from "node:process";
import { database } from "@packages/db";
import { getTableColumns, getTableName } from "@packages/db/drizzle";
import type { PgTable } from "@packages/db/drizzle-pg";
import {
  courseMaterial,
  instructorToWebsocInstructor,
  websocInstructor,
  websocSection,
  websocSectionEnrollment,
  websocSectionGrade,
  websocSectionMeeting,
  websocSectionMeetingToLocation,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { chunkUpsertData } from "@packages/db/utils";

const TABLES: PgTable[] = [
  websocSection,
  courseMaterial,
  websocSectionGrade,
  websocSectionEnrollment,
  websocSectionMeeting,
  websocSectionMeetingToLocation,
  websocInstructor,
  instructorToWebsocInstructor,
  websocSectionToInstructor,
];

const OUT_DIR = process.env.OUT_DIR ?? join(import.meta.dirname, "..", "out");

const chunkPath = (table: PgTable, i: number) => join(OUT_DIR, `${getTableName(table)}-${i}.json`);

async function readChunk(table: PgTable, i: number) {
  if (!existsSync(chunkPath(table, i))) return undefined;
  const rows = JSON.parse(await readFile(chunkPath(table, i), "utf-8"));

  const dateKeys = Object.entries(getTableColumns(table))
    .filter(([, col]) => col.dataType === "date")
    .map(([key]) => key);
  for (const row of rows) {
    for (const key of dateKeys) if (row[key] != null) row[key] = new Date(row[key]);
  }
  return rows as PgTable["$inferInsert"][];
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const missing = TABLES.filter((table) => !existsSync(chunkPath(table, 0)));
  if (missing.length) throw new Error(`Missing ${missing.map((t) => chunkPath(t, 0)).join(", ")}`);

  const db = database(url);

  await db.transaction(async (tx) => {
    for (const table of TABLES.toReversed()) await tx.delete(table);
    for (const table of TABLES) {
      let count = 0;
      for (let i = 0, rows = await readChunk(table, 0); rows; rows = await readChunk(table, ++i)) {
        for (const batch of chunkUpsertData(table, rows)) await tx.insert(table).values(batch);
        count += rows.length;
      }
      console.log(`Replaced ${getTableName(table)} with ${count} row(s)`);
    }
  });

  await db.$client.end({ timeout: 5 });
}

main().then(() => exit(0));
