import { geCategoryToColumn } from "@packages/db/utils";
import { type Exam, type GECategory, geCategories } from "@packages/stdlib";

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
    notes: reward.notes ?? null,
  };
}

export type ImportHandlers = {
  upsertExam: (fullName: string, catalogueName: string | null) => Promise<void>;
  clearMappings: (fullName: string) => Promise<void>;
  createReward: (values: ReturnType<typeof rewardValues>) => Promise<string>;
  addScoreMappings: (fullName: string, scores: number[], rewardId: string) => Promise<void>;
  removeOrphanedRewards: () => Promise<void>;
};

export async function importExams(exams: Record<string, Exam>, handlers: ImportHandlers) {
  for (const [fullName, exam] of Object.entries(exams)) {
    await handlers.upsertExam(fullName, exam.catalogueName ?? null);
    await handlers.clearMappings(fullName);

    for (const reward of exam.rewards) {
      const rewardId = await handlers.createReward(rewardValues(reward));

      await handlers.addScoreMappings(fullName, reward.acceptableScores, rewardId);
    }
  }

  await handlers.removeOrphanedRewards();
}
