import { exit } from "node:process";

import { database } from "@packages/db";

import { apExam, apExamReward, apExamToReward } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import apExamData, { geCategories, type geCategory } from "./data.ts";

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
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  // drizzle doesn't support deferrable fk constraints

  await db.transaction(async (tx) => {
    for (const [fullName, examData] of Object.entries(apExamData)) {
      await tx
        .insert(apExam)
        .values({
          id: fullName,
          catalogueName: examData?.catalogueName ?? null,
        })
        .onConflictDoUpdate({
          target: apExam.id,
          set: conflictUpdateSetAllCols(apExam),
        });

      for (const reward of examData.rewards) {
        const geCourses = Object.fromEntries(
          geCategories.map((cat) => [geCategoryToColumn[cat], reward.geGranted?.[cat] ?? 0]),
        ) as Record<(typeof geCategoryToColumn)[geCategory], number>;

        const { id: rewardId } = await tx
          .insert(apExamReward)
          .values({
            unitsGranted: reward.unitsGranted,
            electiveUnitsGranted: reward.electiveUnitsGranted,
            ...geCourses,
            coursesGranted: reward.coursesGranted,
          })
          .returning({ id: apExamReward.id })
          .then((rows) => rows[0]);

        for (const score of reward.acceptableScores) {
          await tx
            .insert(apExamToReward)
            .values({ examId: fullName, score, reward: rewardId })
            .onConflictDoUpdate({
              target: [apExamToReward.examId, apExamToReward.score],
              set: conflictUpdateSetAllCols(apExamToReward),
            });
        }
      }
    }
  });
  await db.$client.end();

  exit(0);
}

main().then();
