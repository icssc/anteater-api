import type { apExamsQuerySchema } from "$schema";
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

function accumulateRows(
  rows: {
    exam: typeof apExam.$inferSelect;
    scores: number[];
    reward: typeof apExamReward.$inferSelect | null;
  }[],
) {
  const exams = new Map();
  for (const { exam, scores, reward } of rows) {
    if (!exams.has(exam.id)) {
      const examObj = {
        fullName: exam.id,
        catalogueName: exam.catalogueName,
        rewards: [],
      };
      if (scores && reward) {
        examObj.rewards.push({
          acceptableScores: scores,
          ...reward,
          geCategories: Object.entries(geCategoryToFlag)
            .filter(([_, col]) => reward[col])
            .map(([cat, _]) => cat),
        });
      }
      exams.set(exam.id, examObj);
    } else {
      exams.get(exam.id)?.rewards.push({
        acceptableScores: scores,
        ...reward,
        geCategories: Object.entries(geCategoryToFlag)
          .filter(([cat, col]) => reward[col])
          .map(([cat, _]) => cat),
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
