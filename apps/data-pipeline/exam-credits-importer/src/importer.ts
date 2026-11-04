import { type Exam, type GECategory, geCategories } from "@packages/stdlib";

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
