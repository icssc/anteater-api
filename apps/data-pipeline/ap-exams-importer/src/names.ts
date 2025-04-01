// https://apstudents.collegeboard.org/courses
// https://catalogue.uci.edu/informationforprospectivestudents/undergraduateadmissions/#advancedplacementandinternationalbaccalaureatecredittext

import type { APCoursesGrantedTree } from "@packages/db/schema";

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

type APExam = {
  catalogueName?: string;
  creditsAwarded: {
    acceptableScores: (1 | 2 | 3 | 4 | 5)[];
    // units granted, most relevant for residency requirement
    unitsGranted: number;
    // units of catch-all elective credit granted not through a course
    electiveUnitsGranted: number;
    // GEs fulfilled directly and not through a course
    geFulfilled: (typeof geCategories)[number][];
    coursesGranted: APCoursesGrantedTree;
  }[];
};
type Mapping = Record<string, APExam>;

export default {
  "AP African American Studies": {
    // Satisfies one year of U.S. History for the Area A requirement.
    creditsAwarded: [
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP Art History": {
    creditsAwarded: [
      // One course toward Art History major, minor, category IV of the UCI GE requirement as ART HIS 40A, and
      // satisfaction of category VIII, plus 4 units of elective credit; may not replace School of Humanities
      // requirements
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["ART HIS 40A"] },
      },
      // Two courses toward Art History major, minor, category IV of the UCI GE requirement as ART HIS 40A and
      // ART HIS 40B, and satisfaction of category VIII; may not replace School of Humanities requirements
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["ART HIS 40A", "ART HIS 40B"] },
      },
    ],
  },
  "AP Drawing": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP 2-D Art and Design": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP 3-D Art and Design": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP Biology": {
    creditsAwarded: [
      // Non-Bio. Sci. majors earn one Biological Sciences course toward Category II of the UCI GE requirement.
      // Bio. Sci. majors earn elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  // Capstone Research and Seminar: "Approved as Area G college-prep elective only. No university credit awarded"
  "AP Chemistry": {
    catalogueName: "AP CHEMISTRY",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // CHEM 1A or ENGR 1A, plus 4 units of elective credit. Students pursuing Chemistry or a related field,
      // and all students with a score of 5, are encouraged to enroll in Honors General Chemistry:
      // CHEM H2A-CHEM H2B-CHEM H2C
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { OR: ["CHEM 1A", "ENGR 1A"] },
      },
    ],
  },
  "AP Chinese Language and Culture": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // CHINESE 1A-CHINESE 1B-CHINESE 1C, CHINESE 2A. Satisfies categories VI and VIII of the UCI GE requirement.
      // Additional course credit may be awarded following placement examination
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["CHINESE 1A", "CHINESE 1B", "CHINESE 1C", "CHINESE 2A"] },
      },
    ],
  },
  "AP Computer Science A": {
    catalogueName: "AP COMP SCI A",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  // this hasn't been offered since 2009
  "AP Computer Science AB": {
    catalogueName: "AP COMP SCI AB",
    // so we have no idea what they'd accept it as
    creditsAwarded: [],
  },
  "AP Computer Science Principles": {
    creditsAwarded: [
      // I&C SCI 20
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["I&C SCI 20"] },
      },
    ],
  },
  "AP Macroeconomics": {
    catalogueName: "AP ECONOMICS:MACRO",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // ECON 20B or MGMT 4B. May not be used for the School of Social Sciences majors' degree requirements,
      // with the exception of the B.A. in Economics, the B.A. in Business Economics, and the B.A. in Quantitative
      // Economics. May also be used as one lower-division course toward the Economics minor.
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["ECON 20B", "MGMT 4B"] },
      },
    ],
  },
  "AP Microeconomics": {
    catalogueName: "AP ECONOMICS:MICRO",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // ECON 20A or MGMT 4A. May not be used for the School of Social Sciences majors' degree requirements,
      // with the exception of the B.A. in Economics, the B.A. in Business Economics, and the B.A. in Quantitative
      // Economics. May also be used as one lower-division course toward the Economics minor.
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["ECON 20A", "MGMT 4A"] },
      },
    ],
  },
  "AP English Language and Composition": {
    catalogueName: "AP ENGLISH LANGUAGE",
    creditsAwarded: [
      // WRITING 50 and one course toward category IV of the UCI GE requirement for ENGLISH 10 or ENGLISH 12; may not
      // replace Literary Journalism major or minor, English major or minor, or School of Humanities requirements
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["WRITING 50", { OR: ["ENGLISH 10", "ENGLISH 12"] }] },
      },
    ],
  },
  "AP English Literature and Composition": {
    catalogueName: "AP ENGLISH LIT",
    creditsAwarded: [
      // WRITING 50 and one course toward category IV of the UCI GE requirement for ENGLISH 10 or ENGLISH 12; may not
      // replace Literary Journalism major or minor, English major or minor, or School of Humanities requirements
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["WRITING 50", { OR: ["ENGLISH 10", "ENGLISH 12"] }] },
      },
    ],
  },
  "AP Environmental Science": {
    catalogueName: "AP ENVIRONMENTAL SCI",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // EARTHSS 1
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["EARTHSS 1"] },
      },
    ],
  },
  "AP French Language and Culture": {
    creditsAwarded: [
      // FRENCH 1A-FRENCH 1B-FRENCH 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["FRENCH 1A", "FRENCH 1B", "FRENCH 1C"] },
      },
      // FRENCH 2A-FRENCH 2B-FRENCH 2C. Satisfies categories VI and VIII of the UCI GE requirement
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: ["6"],
        coursesGranted: { AND: ["FRENCH 2A", "FRENCH 2B", "FRENCH 2C"] },
      },
    ],
  },
  "AP Human Geography": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP German Language and Culture": {
    creditsAwarded: [
      // GERMAN 1A-GERMAN 1B-GERMAN 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["GERMAN 1A", "GERMAN 1B", "GERMAN 1C"] },
      },
      // GERMAN 2A-GERMAN 2B-GERMAN 2C. Satisfies categories VI and VIII of the UCI GE requirement
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["GERMAN 2A", "GERMAN 2B", "GERMAN 2C"] },
      },
    ],
  },
  "AP United States Government and Politics": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // American Institutions and POL SCI 21A credit. May not be used for the School of Social Sciences majors' degree
      // requirements, with the exception of the B.A. in Political Science. May also be used as one lower-division
      // course toward the Political Science minor.
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        // let's just call it this; seems unlikely you'd want this counted as something else and then do a poli sci minor
        // and you'd have to ask an advisor to move it around
        coursesGranted: { AND: ["POL SCI 21A"] },
      },
    ],
  },
  "AP Comparative Government and Politics": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // POL SCI 51A credit. May not be used for the School of Social Sciences majors' degree requirements, with the
      // exception of the B.A. in Political Science. May also be used as one lower-division course toward the Political
      // Science minor.
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        // same as above
        geFulfilled: [],
        coursesGranted: { AND: ["POL SCI 51A"] },
      },
    ],
  },
  "AP European History": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // One lower-division course toward the History major or minor (excluding HISTORY 70B), GE category IV, and
      // satisfaction of category VIII; plus 4 units of elective credit; may not replace School of Humanities
      // requirements
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: ["4", "8"],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP United States History": {
    creditsAwarded: [
      // Satisfies American History and Institutions requirement
      {
        acceptableScores: [3, 4],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // One course toward HISTORY 40A-HISTORY 40B-HISTORY 40C, GE category IV; plus 4 units of elective credit; may
      // not replace School of Humanities requirements. Satisfies American History and Institutions requirement
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { OR: ["HISTORY 40A", "HISTORY 40B", "HISTORY 40C"] },
      },
    ],
  },
  "AP World History: Modern": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // One course toward HISTORY 21B-HISTORY 21C, GE category IV, and satisfaction of category VIII; plus 4 units of
      // elective credit; may not replace School of Humanities requirements
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { OR: ["HISTORY 21B", "HISTORY 21C"] },
      },
    ],
  },
  "AP Italian Language and Culture": {
    creditsAwarded: [
      // ITALIAN 1A-ITALIAN 1B-ITALIAN 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["ITALIAN 1A", "ITALIAN 1B", "ITALIAN 1C"] },
      },
      // ITALIAN 2A-ITALIAN 2B-ITALIAN 2C. Satisfies categories VI and VIII of the UCI GE requirement
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["ITALIAN 2A", "ITALIAN 2B", "ITALIAN 2C"] },
      },
    ],
  },
  "AP Japanese Language and Culture": {
    creditsAwarded: [
      // JAPANSE 1A-JAPANSE 1B-JAPANSE 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["JAPANSE 1A", "JAPANSE 1B", "JAPANSE 1C"] },
      },
      // JAPANSE 2A-JAPANSE 2B-JAPANSE 2C. Satisfies categories VI and VIII of the UCI GE requirement
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["JAPANSE 2A", "JAPANSE 2B", "JAPANSE 2C"] },
      },
    ],
  },
  "AP Latin": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // Satisfies categories VI and VIII of the UCI GE requirement. Course credit toward the Classics major or School
      // of Humanities language requirement awarded upon petition
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: ["6", "8"],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP Calculus AB": {
    catalogueName: "AP CALCULUS AB",
    creditsAwarded: [
      // MATH 2A or MATH 5A
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["MATH 2A", "MATH 5A"] },
      },
    ],
  },
  "AP Calculus BC": {
    catalogueName: "AP CALCULUS BC",
    creditsAwarded: [
      // MATH 2A or MATH 5A
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["MATH 2A", "MATH 5A"] },
      },
      // MATH 2A-MATH 2B or MATH 5A-MATH 5B
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: [{ AND: ["MATH 2A, MATH 2B"] }, { AND: ["MATH 5A", "MATH 5B"] }] },
      },
    ],
  },
  "AP Calculus BC, Calculus AB subscore": {
    catalogueName: "AP CALCULUS AB SUB",
    creditsAwarded: [
      // Students who take the Calculus BC examination and earn a subscore of 3 or higher on the Calculus AB portion
      // will receive credit for the Calculus AB examination, even if they do not receive a score of 3 or higher on the
      // BC examination.
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["MATH 2A", "MATH 5A"] },
      },
    ],
  },
  // precalculus: "No university credit awarded."
  "AP Music Theory": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP Physics 1: Algebra-Based": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP Physics 2: Algebra-Based": {
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
    ],
  },
  "AP PHYSICS C:MECH": {
    catalogueName: "AP Physics C: Mechanics",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // PHYSICS 2
      {
        acceptableScores: [4],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["PHYSICS 2"] },
      },
      // PHYSICS 3A
      {
        acceptableScores: [5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["PHYSICS 3A"] },
      },
    ],
  },
  "AP Physics C: Electricity and Magnetism": {
    catalogueName: "AP PHYSICS C:E/M",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // PHYSICS 2
      {
        acceptableScores: [4],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["PHYSICS 2"] },
      },
      // PHYSICS 3C
      {
        acceptableScores: [5],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: ["PHYSICS 3C"] },
      },
    ],
  },
  "AP Psychology": {
    catalogueName: "AP PSYCHOLOGY",
    creditsAwarded: [
      // Elective credit only
      {
        acceptableScores: [3],
        unitsGranted: 4,
        electiveUnitsGranted: 4,
        geFulfilled: [],
        coursesGranted: { AND: [] },
      },
      // PSCI 9 or PSYCH 7A
      {
        acceptableScores: [4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["PSCI 9", "PSYCH 7A"] },
      },
    ],
  },
  // AP research: "Satisfies the UC Entry Level Writing Requirement. No university credit awarded"
  // AP seminar: "Satisfies the UC Entry Level Writing Requirement. No university credit awarded"
  "AP Spanish Language and Culture": {
    catalogueName: "AP SPANISH LANGUAGE",
    creditsAwarded: [
      // SPANISH 1A-SPANISH 1B-SPANISH 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["SPANISH 1A", "SPANISH 1B", "SPANISH 1C"] },
      },
      // SPANISH 2A-SPANISH 2B-SPANISH 2C. Satisfies categories VI and VIII of the UCI GE requirement.
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: ["6"],
        coursesGranted: { AND: ["SPANISH 2A", "SPANISH 2B", "SPANISH 2C"] },
      },
    ],
  },
  "AP Spanish Literature and Culture": {
    creditsAwarded: [
      // SPANISH 1A-SPANISH 1B-SPANISH 1C. Satisfies category VI of the UCI GE requirement
      {
        acceptableScores: [3],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { AND: ["SPANISH 1A", "SPANISH 1B", "SPANISH 1C"] },
      },
      // SPANISH 3/SPANISH 3H. Satisfies categories VI, VII, and VIII of the UCI GE requirement
      {
        acceptableScores: [4, 5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        // all three are satisfied given prereq of spanish 1 series
        // spanish 3 and spanish 3h also satisfy different GEs but doing the AP gives you both
        geFulfilled: ["6", "7", "8"],
        coursesGranted: { OR: ["SPANISH 3", "SPANISH 3H"] },
      },
    ],
  },
  "AP Statistics": {
    catalogueName: "AP STATISTICS",
    creditsAwarded: [
      // STATS 7 or STATS 8 or MGMT 7 or SOCECOL 13 or EDUC 15
      {
        acceptableScores: [3, 4, 5],
        unitsGranted: 4,
        electiveUnitsGranted: 0,
        geFulfilled: [],
        coursesGranted: { OR: ["STATS 7", "STATS 8", "MGMT 7", "SOCECOL 13", "EDUC 15"] },
      },
    ],
  },
} as Mapping;
