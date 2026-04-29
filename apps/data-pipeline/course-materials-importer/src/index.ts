import { readdirSync } from "node:fs";
import { exit } from "node:process";
import { database } from "@packages/db";
import { and, eq, getTableColumns, or } from "@packages/db/drizzle";
import type { MaterialTerm, Term } from "@packages/db/schema";
import { courseMaterial, websocSection } from "@packages/db/schema";
import { getFromMapOrThrow } from "@packages/stdlib";
import xlsx from "node-xlsx";

/**
 * Constants and Batching Configuration
 */
const INPUT_DIR = "./input";

// Based on the Power BI 'Select' fields provided in the previous turn
const REQUIRED_FIELDS = ["Term", "Dept", "Course", "Instructor", "Title", "Format"] as const;

const MAX_PARAMS_PER_INSERT = 65534;

// Dynamically calculate batch size to avoid SQL parameter limits
const ROWS_PER_INSERT = Math.floor(
  MAX_PARAMS_PER_INSERT /
    Object.values(getTableColumns(courseMaterial)).filter(
      (data) => !data.default && !data.generated,
    ).length,
);

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found"); // Fail Fast pattern [cite: 174]
  const db = database(url);

  // 1. Load and parse Excel files from the input directory
  const inputData: Map<string, string>[] = readdirSync(INPUT_DIR).flatMap((fileName) => {
    const data: string[][] = xlsx.parse(`${INPUT_DIR}/${fileName}`)[0].data;
    const columns = data[0];

    return data
      .slice(1)
      .filter((x) => x)
      .map(
        (row) =>
          new Map(
            row
              .map((val, i): [string, string] => [columns[i], val])
              .filter((entry) => entry[0] !== undefined),
          ),
      );
  });

  // 2. Validate required fields
  for (const entry of inputData) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry.has(field)) throw new Error(`Missing field: ${field}`);
    }
  }

  const values: (typeof courseMaterial.$inferInsert)[] = [];

  console.log(`Processing ${inputData.length} course material entries...`);

  // 3. Transform data and resolve section IDs
  for (const entry of inputData) {
    const sectionCode = entry.get("Course Code");
    if (!sectionCode) {
      continue;
    }

    const termStr = getFromMapOrThrow(entry, "Term"); // e.g., "Fall 2024"
    const [quarter, year] = termStr.split(" ");

    const deptCourseStr = getFromMapOrThrow(entry, "Dept/Course"); // e.g., "I&C SCI 31"
    const lastSpaceIndex = deptCourseStr.lastIndexOf(" ");
    const dept = deptCourseStr.substring(0, lastSpaceIndex);
    const courseNum = deptCourseStr.substring(lastSpaceIndex + 1);

    const instructor = getFromMapOrThrow(entry, "Instructor");
    const link = entry.get("Link");

    // Look up the section ID based on the course details
    // Note: Course materials are often linked to all sections of a course/instructor
    const [section] = await db
      .select({ id: websocSection.id })
      .from(websocSection)
      .where(
        and(
          eq(websocSection.year, year),
          quarter === "Summer"
            ? or(
                eq(websocSection.quarter, "Summer1"),
                eq(websocSection.quarter, "Summer10wk"),
                eq(websocSection.quarter, "Summer2"),
              )
            : eq(websocSection.quarter, quarter as Term),
          eq(websocSection.sectionCode, Number.parseInt(sectionCode, 10)),
        ),
      );

    if (!section) {
      console.warn(`Could not find section for ${dept} ${courseNum} (${termStr})`);
      continue;
    }

    values.push({
      sectionId: section.id,
      year,
      quarter: quarter as MaterialTerm,
      department: dept,
      courseNumber: parseInt(courseNum.replace(/\D/g, ""), 10) || 0,
      instructor,
      title: getFromMapOrThrow(entry, "Title"),
      author: entry.get("Author"),
      edition: entry.get("Edition"),
      isbn: entry.get("ISBN"),
      format: (entry.get("Format") || null) as any,
      requirement: (entry.get("Req/Rec") || null) as any,
      mmsId: entry.get("MMS ID"),
      link,
    });
  }

  // 4. Batch insert with transaction
  await db.transaction(async (tx) => {
    await tx.delete(courseMaterial);

    for (let i = 0; i < values.length; i += ROWS_PER_INSERT) {
      await tx
        .insert(courseMaterial)
        .values(values.slice(i, i + ROWS_PER_INSERT))
        .onConflictDoNothing(); // Prevent duplicates if re-running
    }
  });

  console.log("Import complete.");
  exit(0);
}

main().then();
