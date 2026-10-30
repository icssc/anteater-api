import type { database } from "@packages/db";
import { and, eq, getTableColumns, sql } from "@packages/db/drizzle";
import { ibExam, ibExamReward, ibExamToReward } from "@packages/db/schema";
import { type GECategory, geCategories } from "@packages/stdlib";
import type { z } from "zod";
import type { ibExamsQuerySchema, ibExamsRewardSchema } from "$schema";

function buildQuery(query: z.infer<typeof ibExamsQuerySchema>) {
  const conds = [];
  if (query.fullName) {
    conds.push(eq(ibExam.id, query.fullName));
  }
  if (query.catalogueName) {
    conds.push(eq(ibExam.catalogueName, query.catalogueName));
  }

  return and(...conds);
}

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

// Uses shared GE categories and a partial record since zero-credit categories are omitted
function geGrantedFromReward(reward: typeof ibExamReward.$inferSelect) {
  return Object.fromEntries(
    geCategories
      .filter((cat) => reward[geCategoryToColumn[cat]] > 0)
      .map((cat) => [cat, reward[geCategoryToColumn[cat]]]),
  ) as Partial<Record<GECategory, number>>;
}

function accumulateRows(
  rows: {
    exam: typeof ibExam.$inferSelect;
    scores: number[];
    reward: typeof ibExamReward.$inferSelect | null;
  }[],
) {
  // Use a typed Map and create each exam once to avoid duplicating reward insertion
  const exams = new Map<
    string,
    {
      fullName: string;
      catalogueName: string | null;
      rewards: z.infer<typeof ibExamsRewardSchema>[];
    }
  >();

  for (const { exam, scores, reward } of rows) {
    if (reward === null) {
      continue;
    }

    let examObj = exams.get(exam.id);

    if (!examObj) {
      examObj = {
        fullName: exam.id,
        catalogueName: exam.catalogueName,
        rewards: [],
      };
      exams.set(exam.id, examObj);
    }

    // Explicitly return API fields instead of spreading internal database columns
    examObj.rewards.push({
      acceptableScores: scores,
      unitsGranted: reward.unitsGranted,
      electiveUnitsGranted: reward.electiveUnitsGranted,
      geGranted: geGrantedFromReward(reward),
      coursesGranted: reward.coursesGranted,
      notes: reward.notes,
    });
  }

  return Array.from(exams.values());
}

export class IBExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getIBExams(query: z.infer<typeof ibExamsQuerySchema>) {
    const conds = buildQuery(query);
    const exams = await this.db
      .select({
        exam: getTableColumns(ibExam),
        scores: sql<number[]>`
          ARRAY_REMOVE(
            ARRAY_AGG(${ibExamToReward.score} ORDER BY ${ibExamToReward.score} ASC),
            NULL
          )
        `,
        reward: getTableColumns(ibExamReward),
      })
      .from(ibExam)
      .leftJoin(ibExamToReward, eq(ibExam.id, ibExamToReward.examId))
      .leftJoin(ibExamReward, eq(ibExamToReward.reward, ibExamReward.id))
      .groupBy(ibExam.id, ibExamToReward.reward, ibExamReward.id)
      .where(conds);

    return accumulateRows(exams);
  }
}
