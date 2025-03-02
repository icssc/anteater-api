import { exit } from "node:process";

import { database } from "@packages/db";
import { apExams } from "@packages/db/schema";

import { conflictUpdateSetAllCols } from "@packages/db/utils";

import apExamNames from "./names";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  await db
    .insert(apExams)
    .values(Object.entries(apExamNames).map(([id, officialName]) => ({ id, officialName })))
    .onConflictDoUpdate({ target: apExams.id, set: conflictUpdateSetAllCols(apExams) });

  await db.$client.end();

  exit(0);
}

main().then();
