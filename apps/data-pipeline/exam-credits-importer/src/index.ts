import { database } from "@packages/db";

import apExamData from "./ap-data.ts";
import ibExamData from "./ib-data.ts";
import { importExams } from "./importer.ts";
import { apExamDataSchema, ibExamDataSchema } from "./schema.ts";

async function main() {
  const examType = process.argv[2];

  if (examType !== "ap" && examType !== "ib") {
    throw new Error("Specify an exam type: ap or ib");
  }

  const exams =
    examType === "ap" ? apExamDataSchema.parse(apExamData) : ibExamDataSchema.parse(ibExamData);

  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

  try {
    await importExams(db, examType, exams);

    console.log(
      `Successfully imported ${Object.keys(exams).length} ${examType.toUpperCase()} exams.`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("Exam import failed:", error);
  process.exitCode = 1;
});
