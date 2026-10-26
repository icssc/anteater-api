import type { CoursesGrantedTree } from "@packages/db/schema";

// The GE categories used by the existing AP importer.
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

export type IBExam = {
  catalogueName?: string;
  rewards: {
    acceptableScores: (5 | 6 | 7)[];
    unitsGranted: number;
    electiveUnitsGranted: number;
    geGranted: Partial<Record<GECategory, number>>;
    coursesGranted: CoursesGrantedTree;
    notes?: string;
  }[];
};

export type IBExamMapping = Record<string, IBExam>;

// Initial examples; we'll add the remaining subjects later.
const ibExamData: IBExamMapping = {
  "IB Chemistry (HL)": {
    rewards: [
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Economics (HL)": {
    rewards: [
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: {
          OR: [{ AND: ["ECON 20A", "ECON 20B"] }, { AND: ["MGMT 4A", "MGMT 4B"] }],
        },
        notes: "Satisfies the Economics major requirement and UCI GE category III.",
      },
    ],
  },
};

export default ibExamData;
