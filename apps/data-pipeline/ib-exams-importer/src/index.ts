import { database } from "@packages/db";
import { eq, notInArray } from "@packages/db/drizzle";
import { ibExam, ibExamReward, ibExamToReward } from "@packages/db/schema";

import { type GECategory, geCategories } from "@packages/stdlib";
import ibExamData from "./data.ts";

const geCategoryToColumn = {
  "GE-1A": "ge1aCoursesGranted",
  "GE-1B": "ge1bCoursesGranted",
  "GE-2": "ge2CoursesGranted",
  "GE-3": "ge3CoursesGranted",
  "GE-4": "ge4CoursesGranted",
  "GE-5A": "ge5aCoursesGranted",
  "GE-5B": "ge5bCoursesGranted",
  "GE-6": "ge6CoursesGranted",
  "GE-7": "ge7CoursesGranted",
  "GE-8": "ge8CoursesGranted",
} as const;

// Check the manually maintained data before changing the database.
function validateData() {
  if (Object.keys(ibExamData).length === 0) {
    throw new Error("No IB exam data found");
  }

  for (const [examName, exam] of Object.entries(ibExamData)) {
    if (!examName.trim() || exam.rewards.length === 0) {
      throw new Error(`Invalid IB exam: ${examName}`);
    }

    const seenScores = new Set<number>();

    for (const reward of exam.rewards) {
      if (reward.acceptableScores.length === 0) {
        throw new Error(`${examName}: reward has no scores`);
      }

      for (const score of reward.acceptableScores) {
        if (![5, 6, 7].includes(score) || seenScores.has(score)) {
          throw new Error(`${examName}: invalid or duplicate score ${score}`);
        }
        seenScores.add(score);
      }

      if (
        !Number.isInteger(reward.unitsGranted) ||
        !Number.isInteger(reward.electiveUnitsGranted) ||
        reward.unitsGranted < 0 ||
        reward.electiveUnitsGranted < 0 ||
        reward.electiveUnitsGranted > reward.unitsGranted
      ) {
        throw new Error(`${examName}: invalid credit units`);
      }

      for (const amount of Object.values(reward.geGranted)) {
        if (!Number.isInteger(amount) || amount < 0) {
          throw new Error(`${examName}: invalid GE credit`);
        }
      }
    }
  }
}

async function main() {
  validateData();

  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);
  const exams = Object.entries(ibExamData);

  try {
    await db.transaction(async (tx) => {
      for (const [fullName, examData] of exams) {
        // Insert the exam, or update it if it already exists.
        await tx
          .insert(ibExam)
          .values({
            id: fullName,
            catalogueName: examData.catalogueName ?? null,
          })
          .onConflictDoUpdate({
            target: ibExam.id,
            set: {
              catalogueName: examData.catalogueName ?? null,
            },
          });

        // Remove old score mappings for this exam.
        await tx.delete(ibExamToReward).where(eq(ibExamToReward.examId, fullName));

        for (const reward of examData.rewards) {
          const geCourses = Object.fromEntries(
            geCategories.map((category) => [
              geCategoryToColumn[category],
              reward.geGranted[category] ?? 0,
            ]),
          ) as Record<(typeof geCategoryToColumn)[GECategory], number>;

          // Create the reward record.
          const [insertedReward] = await tx
            .insert(ibExamReward)
            .values({
              unitsGranted: reward.unitsGranted,
              electiveUnitsGranted: reward.electiveUnitsGranted,
              ...geCourses,
              coursesGranted: reward.coursesGranted,
              notes: reward.notes ?? null,
            })
            .returning({ id: ibExamReward.id });

          // Connect each eligible score to that reward.
          await tx.insert(ibExamToReward).values(
            reward.acceptableScores.map((score) => ({
              examId: fullName,
              score,
              reward: insertedReward.id,
            })),
          );
        }
      }

      // Remove rewards no longer referenced by any score.
      await tx
        .delete(ibExamReward)
        .where(
          notInArray(
            ibExamReward.id,
            tx.select({ id: ibExamToReward.reward }).from(ibExamToReward),
          ),
        );
    });

    console.log(`Successfully imported ${exams.length} IB exams.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("IB import failed:", error);
  process.exitCode = 1;
});
