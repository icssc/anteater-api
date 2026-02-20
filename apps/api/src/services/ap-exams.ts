import type { apExamsQuerySchema, apExamsRewardSchema } from "$schema";
import type { database } from "@packages/db";
import { and, eq, getTableColumns, sql } from "@packages/db/drizzle";
import { apExam, apExamReward, apExamToReward } from "@packages/db/schema";

import type { z } from "zod";

function buildQuery(query: z.infer<typeof apExamsQuerySchema>) {
  const conds = [];
  if (query.fullName) {
    conds.push(eq(apExam.id, query.fullName));
  }
  if (query.catalogueName) {
    conds.push(eq(apExam.catalogueName, query.catalogueName));
  }

  return and(...conds);
}

export const geCategoryToColumn = {
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

function geGrantedFromReward(reward: typeof apExamReward.$inferSelect) {
  // cast is safe because we knew the types going into this
  return Object.fromEntries(
    Object.entries(geCategoryToColumn)
      .filter(([_, col]) => reward[col] > 0)
      .map(([cat, col]) => [cat as keyof typeof geCategoryToColumn, reward[col]]),
  ) as Record<keyof typeof geCategoryToColumn, number>;
}

function accumulateRows(
  rows: {
    exam: typeof apExam.$inferSelect;
    scores: number[];
    reward: typeof apExamReward.$inferSelect | null;
  }[],
) {
  const exams = new Map();
  for (const { exam, scores, reward } of rows) {
    if (reward === null) {
      continue;
    }

    if (!exams.has(exam.id)) {
      const examObj = {
        fullName: exam.id,
        catalogueName: exam.catalogueName,
        rewards: [] as z.infer<typeof apExamsRewardSchema>[],
      };
      if (scores && reward) {
        examObj.rewards.push({
          acceptableScores: scores,
          ...reward,
          geGranted: geGrantedFromReward(reward),
        });
      }
      exams.set(exam.id, examObj);
    } else {
      exams.get(exam.id)?.rewards.push({
        acceptableScores: scores,
        ...reward,
        geGranted: geGrantedFromReward(reward),
      });
    }
  }

  return Array.from(exams.values());
}

export class APExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getAPExams(query: z.infer<typeof apExamsQuerySchema>) {
    const conds = buildQuery(query);
    const exams = await this.db
      .select({
        exam: getTableColumns(apExam),
        scores: sql<
          number[]
        >`ARRAY_REMOVE(ARRAY_AGG(${apExamToReward.score} ORDER BY ${apExamToReward.score} ASC), NULL)`,
        reward: getTableColumns(apExamReward),
      })
      .from(apExam)
      .leftJoin(apExamToReward, eq(apExam.id, apExamToReward.examId))
      .leftJoin(apExamReward, eq(apExamToReward.reward, apExamReward.id))
      .groupBy(apExam.id, apExamToReward.reward, apExamReward.id)
      .where(conds);

    return accumulateRows(exams);
  }
}
