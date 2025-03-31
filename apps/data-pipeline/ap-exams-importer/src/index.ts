import { exit } from "node:process";

import { database } from "@packages/db";

import { apExamReward, apExamToReward, apExams } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import apExamData, { type geCategories } from "./names";

const geCategoryToFlag = {
  "1A": "GE1A",
  "1B": "GE1B",
  "2": "GE2",
  "3": "GE3",
  "4": "GE4",
  "5A": "GE5A",
  "5B": "GE5B",
  "6": "GE6",
  "7": "GE7",
  "8": "GE8",
} as const;

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);

  // drizzle doesn't support deferrable fk constraints

  await db.transaction(async (tx) => {
    for (const [fullName, examData] of Object.entries(apExamData)) {
      await tx
        .insert(apExams)
        .values({ id: fullName, catalogueName: examData?.catalogueName ?? null })
        .onConflictDoUpdate({ target: apExams.id, set: conflictUpdateSetAllCols(apExams) });

      for (const reward of examData.creditsAwarded) {
        const mappedCategories = reward.geFulfilled.map((cat) => geCategoryToFlag[cat]);
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
