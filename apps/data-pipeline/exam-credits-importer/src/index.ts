import { database } from "@packages/db";
import { eq, notInArray } from "@packages/db/drizzle";
import {
  apExam,
  apExamReward,
  apExamToReward,
  ibExam,
  ibExamReward,
  ibExamToReward,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";

import apExamData from "./ap-data.ts";
import ibExamData from "./ib-data.ts";
import { importExams } from "./importer.ts";
import { apExamDataSchema, ibExamDataSchema } from "./schema.ts";

async function main() {
  const examType = process.argv[2];

  if (examType !== "ap" && examType !== "ib") {
    throw new Error("Specify an exam type: ap or ib");
  }

  // Validate everything before modifying the database.
  const exams =
    examType === "ap" ? apExamDataSchema.parse(apExamData) : ibExamDataSchema.parse(ibExamData);

  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

  try {
    await db.transaction(async (tx) => {
      if (examType === "ap") {
        await importExams(exams, {
          upsertExam: async (fullName, catalogueName) => {
            await tx
              .insert(apExam)
              .values({ id: fullName, catalogueName })
              .onConflictDoUpdate({
                target: apExam.id,
                set: conflictUpdateSetAllCols(apExam),
              });
          },

          clearMappings: async (fullName) => {
            await tx.delete(apExamToReward).where(eq(apExamToReward.examId, fullName));
          },

          createReward: async (values) => {
            const [created] = await tx
              .insert(apExamReward)
              .values(values)
              .returning({ id: apExamReward.id });

            return created.id;
          },

          addScoreMappings: async (fullName, scores, rewardId) => {
            if (scores.length === 0) return;

            await tx.insert(apExamToReward).values(
              scores.map((score) => ({
                examId: fullName,
                score,
                reward: rewardId,
              })),
            );
          },

          removeOrphanedRewards: async () => {
            await tx
              .delete(apExamReward)
              .where(
                notInArray(
                  apExamReward.id,
                  tx.select({ id: apExamToReward.reward }).from(apExamToReward),
                ),
              );
          },
        });
      } else {
        await importExams(exams, {
          upsertExam: async (fullName, catalogueName) => {
            await tx.insert(ibExam).values({ id: fullName, catalogueName }).onConflictDoUpdate({
              target: ibExam.id,
              set: { catalogueName },
            });
          },

          clearMappings: async (fullName) => {
            await tx.delete(ibExamToReward).where(eq(ibExamToReward.examId, fullName));
          },

          createReward: async (values) => {
            const [created] = await tx
              .insert(ibExamReward)
              .values(values)
              .returning({ id: ibExamReward.id });

            return created.id;
          },

          addScoreMappings: async (fullName, scores, rewardId) => {
            if (scores.length === 0) return;

            await tx.insert(ibExamToReward).values(
              scores.map((score) => ({
                examId: fullName,
                score,
                reward: rewardId,
              })),
            );
          },

          removeOrphanedRewards: async () => {
            await tx
              .delete(ibExamReward)
              .where(
                notInArray(
                  ibExamReward.id,
                  tx.select({ id: ibExamToReward.reward }).from(ibExamToReward),
                ),
              );
          },
        });
      }
    });

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
