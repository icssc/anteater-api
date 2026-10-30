export const geCategories = [
  "GE-1A",
  "GE-1B",
  "GE-2",
  "GE-3",
  "GE-4",
  "GE-5A",
  "GE-5B",
  "GE-6",
  "GE-7",
  "GE-8",
] as const;

export type GECategory = (typeof geCategories)[number];

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
