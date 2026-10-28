import { database } from "@packages/db";
import { eq, notInArray } from "@packages/db/drizzle";
import { ibExam, ibExamReward, ibExamToReward } from "@packages/db/schema";

import { type GECategory, geCategories } from "@packages/stdlib";
import ibExamData from "./data.ts";
import { ibExamDataSchema } from "./schema.ts";

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

async function main() {
  const exams = Object.entries(ibExamDataSchema.parse(ibExamData));

  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

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
