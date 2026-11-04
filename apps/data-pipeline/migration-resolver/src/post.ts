import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exit } from "node:process";
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

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < TRUNC_TABLES.length; i++) {
    let n = await db.$count(TRUNC_TABLES[i]);
    let v = 0;

    while (n > 0) {
      const rows = await db
        .select()
        .from(TRUNC_TABLES[i])
        .orderBy(
          (Object.values(getTableColumns(TRUNC_TABLES[i])) as any[]).find((col) => col.primary),
        )
        .limit(CHUNK_SIZE)
        .offset(CHUNK_SIZE * v);

      const filePath = path.join(OUT_DIR, `${FILE_NAMES[i]}-${v}.json`);
      const jsonString = JSON.stringify(rows);

      await writeFile(filePath, jsonString, "utf-8");
      n -= CHUNK_SIZE;
      v++;
    }
  }

  await db.$client.end({ timeout: 5 });
}

main().then(() => exit(0));
