import { exit } from "node:process";

import { database } from "@packages/db";

import { apExam, apExamReward, apExamToReward } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import apExamData, { type geCategories } from "./names";

const geCategoryToFlag = {
  "GE-1A": "grantsGE1A",
  "GE-1B": "grantsGE1B",
  "GE-2": "grantsGE2",
  "GE-3": "grantsGE3",
  "GE-4": "grantsGE4",
  "GE-5A": "grantsGE5A",
  "GE-5B": "grantsGE5B",
  "GE-6": "grantsGE6",
  "GE-7": "grantsGE7",
  "GE-8": "grantsGE8",
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
        .values({ id: fullName, catalogueName: examData?.catalogueName ?? null })
        .onConflictDoUpdate({ target: apExam.id, set: conflictUpdateSetAllCols(apExam) });

      for (const reward of examData.creditsAwarded) {
        const mappedCategories = reward.geGranted.map((cat) => geCategoryToFlag[cat]);
        const geFlags = Object.fromEntries(
          Object.values(geCategoryToFlag).map((f) => [f, mappedCategories.includes(f)]),
        ) as Record<(typeof geCategoryToFlag)[(typeof geCategories)[number]], boolean>;
        const { id: rewardId } = await tx
          .insert(apExamReward)
          .values({
            unitsGranted: reward.unitsGranted,
            electiveUnitsGranted: reward.electiveUnitsGranted,
            ...geFlags,
            coursesGranted: reward.coursesGranted,
          })
          .returning({ id: apExamReward.id })
          .then((rows) => rows[0]);

        for (const score of reward.acceptableScores) {
          await tx.insert(apExamToReward).values({ examId: fullName, score, reward: rewardId });
        }
      }
    }
  });

  await db.$client.end();

  exit(0);
}

main().then();
