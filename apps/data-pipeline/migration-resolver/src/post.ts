import { once } from "node:events";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { exit } from "node:process";
import { finished } from "node:stream/promises";
import { database } from "@packages/db";
import { getTableColumns } from "@packages/db/drizzle";
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

const CHUNK_SIZE = 4000;

const OUT_DIR = process.env.OUT_DIR ?? path.join(import.meta.dirname, "..", "out");

const TRUNC_TABLES: PgTable[] = [
  websocSectionToInstructor,
  instructorToWebsocInstructor,
  websocInstructor,
  websocSectionMeetingToLocation,
  websocSectionMeeting,
  websocSectionEnrollment,
  websocSectionGrade,
  courseMaterial,
  websocSection,
];

const FILE_NAMES = [
  "websoc_section_to_instructor",
  "instructor_to_websoc_instructor",
  "websoc_instructor",
  "websoc_section_meeting_to_location",
  "websoc_section_meeting",
  "websoc_section_enrollment",
  "websoc_section_grade",
  "course_material",
  "websoc_section",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

async function write(stream: WriteStream, data: string) {
  if (!stream.write(data)) await once(stream, "drain");
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < TRUNC_TABLES.length; i++) {
    const table = TRUNC_TABLES[i];
    const columns = getTableColumns(table) as Record<string, any>;
    const keys = Object.keys(columns);

    const pkCols = Object.values(columns).filter((col) => col.primary);
    const orderCols = pkCols.length > 0 ? pkCols : Object.values(columns);

    const filePath = path.join(OUT_DIR, `${FILE_NAMES[i]}.csv`);
    const out = createWriteStream(filePath, { encoding: "utf-8" });

    await write(out, csvLine(keys));

    let offset = 0;
    while (true) {
      const rows = await db
        .select()
        .from(table)
        .orderBy(...orderCols)
        .limit(CHUNK_SIZE)
        .offset(offset);

      if (rows.length === 0) break;

      let chunk = "";
      for (const row of rows as Record<string, unknown>[]) {
        chunk += csvLine(keys.map((k) => row[k]));
      }
      await write(out, chunk);

      if (rows.length < CHUNK_SIZE) break;
      offset += CHUNK_SIZE;
    }

    out.end();
    await finished(out);
    console.log(`Wrote ${filePath}`);
  }

  await db.$client.end({ timeout: 5 });
}

main()
  .then(() => exit(0))
  .catch((err) => {
    console.error(err);
    exit(1);
  });
