import { exit } from "node:process";
import { database } from "@packages/db";
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

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  for (let i = 0; i < TRUNC_TABLES.length; i++) {
    await db.delete(TRUNC_TABLES[i]);
  }

  await db.$client.end({ timeout: 5 });
}

main().then(() => exit(0));
