import type { database } from "@packages/db";
import { eq, notInArray } from "@packages/db/drizzle";
import {
  apExam,
  apExamReward,
  apExamToReward,
  ibExam,
  ibExamReward,
  ibExamToReward,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols, geCategoryToColumn } from "@packages/db/utils";
import { type Exam, type GECategory, geCategories } from "@packages/stdlib";

type ExamType = "ap" | "ib";
type GEColumn = (typeof geCategoryToColumn)[GECategory];

function rewardValues(reward: Exam["rewards"][number]) {
  const geColumns = Object.fromEntries(
    geCategories.map((category) => [geCategoryToColumn[category], reward.geGranted[category] ?? 0]),
  ) as Record<GEColumn, number>;

  return {
    unitsGranted: reward.unitsGranted,
    electiveUnitsGranted: reward.electiveUnitsGranted,
    ...geColumns,
    coursesGranted: reward.coursesGranted,
    notes: reward.notes,
  };
}

export async function importExams(
  db: ReturnType<typeof database>,
  examType: ExamType,
  exams: Record<string, Exam>,
) {
  const { examTable, rewardTable, mappingTable } = {
    ap: {
      examTable: apExam,
      rewardTable: apExamReward,
      mappingTable: apExamToReward,
    },
    ib: {
      examTable: ibExam,
      rewardTable: ibExamReward,
      mappingTable: ibExamToReward,
    },
  }[examType];

  await db.transaction(async (tx) => {
    for (const [fullName, exam] of Object.entries(exams)) {
      const catalogueName = exam.catalogueName ?? null;

      // Update the exam record.
      await tx
        .insert(examTable)
        .values({ id: fullName, catalogueName })
        .onConflictDoUpdate({
          target: examTable.id,
          set: examType === "ap" ? conflictUpdateSetAllCols(examTable) : { catalogueName },
        });

      // Replace the existing score mappings for this exam.
      await tx.delete(mappingTable).where(eq(mappingTable.examId, fullName));

      for (const reward of exam.rewards) {
        const [created] = await tx
          .insert(rewardTable)
          .values(rewardValues(reward))
          .returning({ id: rewardTable.id });

        if (reward.acceptableScores.length > 0) {
          await tx.insert(mappingTable).values(
            reward.acceptableScores.map((score) => ({
              examId: fullName,
              score,
              reward: created.id,
            })),
          );
        }
      }
    }

    // Remove rewards no longer referenced by any score.
    await tx
      .delete(rewardTable)
      .where(notInArray(rewardTable.id, tx.select({ id: mappingTable.reward }).from(mappingTable)));
  });
}
