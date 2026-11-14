import type { GECategory } from "./ge-categories";

export type ExamCoursesGrantedTree =
  | { AND: (ExamCoursesGrantedTree | string)[] }
  | { OR: (ExamCoursesGrantedTree | string)[] };

export type Exam<Score extends number = number> = {
  catalogueName?: string;
  rewards: {
    acceptableScores: Score[];
    // Total units granted by this reward
    unitsGranted: number;
    // Elective units granted without a specific course
    electiveUnitsGranted: number;
    // Number of GE courses granted directly, not through a course
    geGranted: Partial<Record<GECategory, number>>;
    coursesGranted: ExamCoursesGrantedTree;
    notes?: string;
  }[];
};
