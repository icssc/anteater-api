import { readdirSync } from "node:fs";
import { exit } from "node:process";
import { database } from "@packages/db";
import { and, eq, getTableColumns, or } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { websocSection, websocSectionGrade } from "@packages/db/schema";
import { getFromMapOrThrow } from "@packages/stdlib";
import xlsx from "node-xlsx";

// The directory from which to read grades statistics spreadsheets.
const INPUT_DIR = "./input";

// All fields that should be present in the given data.
//  May need to be updated from time to time as the format changes.
const REQUIRED_FIELDS = [
  "CalYr",
  "AcadTerm",
  "CourseCode",
  "GradeACount",
  "GradeBCount",
  "GradeCCount",
  "GradeDCount",
  "GradeFCount",
  "GradePCount",
  "GradeNPCount",
  "GradeWCount",
] as const;

const MAX_PARAMS_PER_INSERT = 65534;

const ROWS_PER_INSERT = Math.floor(
  MAX_PARAMS_PER_INSERT /
    Object.values(getTableColumns(websocSectionGrade)).filter(
      (data) => !data.default && !data.generated,
    ).length,
);

const gradesSectionMapper = (
  gs: Map<string, string>,
): [string, Omit<typeof websocSectionGrade.$inferInsert, "sectionId">] => [
  `${getFromMapOrThrow(gs, "CalYr")},${getFromMapOrThrow(gs, "AcadTerm")},${getFromMapOrThrow(gs, "CourseCode")}`,
  {
    gradeACount: Number.parseInt(getFromMapOrThrow(gs, "GradeACount"), 10),
    gradeBCount: Number.parseInt(getFromMapOrThrow(gs, "GradeBCount"), 10),
    gradeCCount: Number.parseInt(getFromMapOrThrow(gs, "GradeCCount"), 10),
    gradeDCount: Number.parseInt(getFromMapOrThrow(gs, "GradeDCount"), 10),
    gradeFCount: Number.parseInt(getFromMapOrThrow(gs, "GradeFCount"), 10),
    gradePCount: Number.parseInt(getFromMapOrThrow(gs, "GradePCount"), 10),
    gradeNPCount: Number.parseInt(getFromMapOrThrow(gs, "GradeNPCount"), 10),
    gradeWCount: Number.parseInt(getFromMapOrThrow(gs, "GradeWCount"), 10),
    averageGPA: gs.get("Avg. GradedGPAAvg"),
  },
];

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  const inputData: Map<string, string>[] = readdirSync(INPUT_DIR).flatMap((fileName) => {
    const data: string[][] = xlsx.parse(`${INPUT_DIR}/${fileName}`)[0].data;
    const columns = data[0];
    const rows = data.slice(1);
    const lastNonEmpty = rows.findLastIndex((x) => x?.some((y) => y));
    return rows
      .slice(0, lastNonEmpty + 1)
      .map(
        (row) =>
          new Map(
            row.map((column, index): [string, string] => [columns[index], column]).filter((x) => x),
          ),
      );
  });
  for (const entry of inputData) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry.has(field)) {
        console.log(`Malformed data: entry missing field ${field}`);
        console.log(entry);
        throw new Error("Malformed data");
      }
    }
  }
  const sections = new Map(inputData.map(gradesSectionMapper));
  const values: (typeof websocSectionGrade.$inferInsert)[] = [];
  for (const [key, data] of sections.entries()) {
    const [year, quarter, sectionCode] = key.split(",", 3);
    const [row] = await db
      .select({ sectionId: websocSection.id })
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
    if (!row) continue;
    values.push({ sectionId: row.sectionId, ...data });
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += ROWS_PER_INSERT) {
      await tx
        .insert(websocSectionGrade)
        .values(values.slice(i, i + ROWS_PER_INSERT))
        .onConflictDoNothing();
    }
  });
  exit(0);
}

main().then();
