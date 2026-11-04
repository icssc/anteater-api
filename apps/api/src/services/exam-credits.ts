import type { database } from "@packages/db";
import { and, eq, getTableColumns, sql } from "@packages/db/drizzle";
import {
  apExam,
  apExamReward,
  apExamToReward,
  ibExam,
  ibExamReward,
  ibExamToReward,
} from "@packages/db/schema";
import { geCategoryToColumn } from "@packages/db/utils";
import { type ExamCoursesGrantedTree, type GECategory, geCategories } from "@packages/stdlib";

type ExamQuery = {
  fullName?: string;
  catalogueName?: string;
};

// AP and IB reward tables now have the same selected fields.
type ExamRewardRow = typeof apExamReward.$inferSelect;

type ExamRow = {
  exam: typeof apExam.$inferSelect;
  scores: number[];
  reward: ExamRewardRow | null;
};

type ExamRewardResponse = {
  acceptableScores: number[];
  unitsGranted: number;
  electiveUnitsGranted: number;
  geGranted: Partial<Record<GECategory, number>>;
  coursesGranted: ExamCoursesGrantedTree;
  notes: string | null;
};

type ExamResponse = {
  fullName: string;
  catalogueName: string | null;
  rewards: ExamRewardResponse[];
};

function geGrantedFromReward(reward: ExamRewardRow) {
  return Object.fromEntries(
    geCategories
      .filter((category) => reward[geCategoryToColumn[category]] > 0)
      .map((category) => [category, reward[geCategoryToColumn[category]]]),
  ) as Partial<Record<GECategory, number>>;
}

function accumulateRows(rows: ExamRow[]): ExamResponse[] {
  const exams = new Map<string, ExamResponse>();

  for (const { exam, scores, reward } of rows) {
    // Preserve existing API behavior: omit exams without rewards
    if (reward === null) continue;

    let examObj = exams.get(exam.id);

    if (!examObj) {
      examObj = {
        fullName: exam.id,
        catalogueName: exam.catalogueName,
        rewards: [],
      };
      exams.set(exam.id, examObj);
    }

    // Explicitly map public fields instead of spreading DB columns
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

export class APExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getAPExams(query: ExamQuery) {
    const conds = and(
      query.fullName ? eq(apExam.id, query.fullName) : undefined,
      query.catalogueName ? eq(apExam.catalogueName, query.catalogueName) : undefined,
    );

    const rows = await this.db
      .select({
        exam: getTableColumns(apExam),
        scores: sql<number[]>`
          ARRAY_REMOVE(
            ARRAY_AGG(${apExamToReward.score} ORDER BY ${apExamToReward.score} ASC),
            NULL
          )
        `,
        reward: getTableColumns(apExamReward),
      })
      .from(apExam)
      .leftJoin(apExamToReward, eq(apExam.id, apExamToReward.examId))
      .leftJoin(apExamReward, eq(apExamToReward.reward, apExamReward.id))
      .groupBy(apExam.id, apExamToReward.reward, apExamReward.id)
      .where(conds);

    return accumulateRows(rows);
  }
}

export class IBExamsService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getIBExams(query: ExamQuery) {
    const conds = and(
      query.fullName ? eq(ibExam.id, query.fullName) : undefined,
      query.catalogueName ? eq(ibExam.catalogueName, query.catalogueName) : undefined,
    );

    const rows = await this.db
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

    return accumulateRows(rows);
  }
}
