// https://catalogue.uci.edu/informationforprospectivestudents/undergraduateadmissions/#advancedplacementandinternationalbaccalaureatecredittext

import type { Exam } from "@packages/stdlib";

export type IBExamMapping = Record<string, Exam<5 | 6 | 7>>;

// IB Higher Level exams generally award 8 quarter units for scores of 5-7.
// Use notes for requirements or restrictions that the credit tree can't express.
// Avoid granting GE credit twice when a named course already satisfies it.
const ibExamData: IBExamMapping = {
  "IB Chemistry (HL)": {
    rewards: [
      // Elective credit only.
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
      // ECON 20A-20B or MGMT 4A-4B.
      // Also satisfies the Economics major requirement and GE category III.
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

  "IB Business & Management (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Dance (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Film (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Global Politics (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Music (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Philosophy (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Theater Arts (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Visual Arts (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Geography (HL)": {
    rewards: [
      // Two Geography courses toward GE III; no specific UCI course IDs listed.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-3": 2 },
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Physics (HL)": {
    rewards: [
      // Two Physics courses toward GE II; no specific UCI course IDs listed.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-2": 2 },
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Computer Science (HL)": {
    rewards: [
      // I&C SCI 20; UCI awards 8 total units.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["I&C SCI 20"] },
        notes:
          "UCI awards 8 quarter units and I&C SCI 20 credit; additional elective units are not specified.",
      },
    ],
  },

  "IB Mathematics (HL, 2020 and before)": {
    rewards: [
      // Historical Mathematics exam (2020 and before): MATH 2A or MATH 5A.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { OR: ["MATH 2A", "MATH 5A"] },
        notes:
          "UCI awards 8 quarter units; additional elective units beyond the course equivalency are not specified.",
      },
    ],
  },

  "IB Mathematics: Analysis and Approaches (HL, 2021 and later)": {
    rewards: [
      // Replaced the older Mathematics exam in 2021.
      // Applications and Interpretations (2021+) receives no UCI credit.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { OR: ["MATH 2A", "MATH 5A"] },
        notes:
          "UCI awards 8 quarter units; additional elective units beyond the course equivalency are not specified.",
      },
    ],
  },

  "IB Further Mathematics (HL, 2020 and before)": {
    rewards: [
      // Historical exam (2020 and before): both MATH 3A and MATH 13.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["MATH 3A", "MATH 13"] },
      },
    ],
  },

  "IB Psychology (HL)": {
    rewards: [
      // Score 5 satisfies GE III but has no named course equivalency.
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes: "Satisfies UCI GE category III.",
      },
      // Scores 6-7 grant COGS 7A or PSY 9 and satisfy GE III.
      {
        acceptableScores: [6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { OR: ["COGS 7A", "PSY 9"] },
        notes:
          "Satisfies UCI GE category III. The catalogue does not specify how remaining units are classified.",
      },
    ],
  },

  "IB Social and Cultural Anthropology (HL)": {
    rewards: [
      // ANTHRO 2A satisfies GE III and VIII.
      // Also satisfies the School of Social Sciences school requirement.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["ANTHRO 2A"] },
        notes:
          "ANTHRO 2A satisfies one course toward GE category III and one toward category VIII. Also satisfies the School of Social Sciences school requirement.",
      },
    ],
  },

  "IB History of the Americas (HL)": {
    rewards: [
      // Two courses toward HISTORY 40A-40C, for GE IV only.
      // Does not count toward School of Humanities major requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-4": 2 },
        coursesGranted: { AND: [] },
        notes:
          "Satisfies two courses toward HISTORY 40A, 40B, or 40C, and the American History and Institutions requirement. Credit applies toward GE requirements, not School of Humanities major requirements.",
      },
    ],
  },

  "IB Biology (HL)": {
    rewards: [
      // Non-Bio. Sci. majors receive one GE II course.
      // Bio. Sci. majors receive elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes:
          "Non-Biological Sciences majors receive one Biological Sciences course toward GE category II. Biological Sciences majors receive elective credit only.",
      },
    ],
  },

  "IB Classical Greek (HL)": {
    rewards: [
      // Score 5: GREEK 100.
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["GREEK 100"] },
        notes:
          "Satisfies the School of Humanities language other than English requirement and GE categories VI and VIII.",
      },
      // Scores 6-7: GREEK 100 plus two courses from GREEK 103/104.
      // Repeated courses are kept in notes rather than the course tree.
      {
        acceptableScores: [6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["GREEK 100"] },
        notes:
          "Also grants two courses of GREEK 103, two of GREEK 104, or one each of GREEK 103 and GREEK 104. Satisfies the School of Humanities language other than English requirement and GE categories VI and VIII.",
      },
    ],
  },

  "IB Latin (HL)": {
    rewards: [
      // Score 5: LATIN 100.
      {
        acceptableScores: [5],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["LATIN 100"] },
        notes:
          "Satisfies the School of Humanities language other than English requirement and GE categories VI and VIII.",
      },
      // Scores 6-7: LATIN 100 plus two courses from LATIN 103/104.
      // Repeated courses are kept in notes rather than the course tree.
      {
        acceptableScores: [6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["LATIN 100"] },
        notes:
          "Also grants two courses of LATIN 103, two of LATIN 104, or one each of LATIN 103 and LATIN 104. Satisfies the School of Humanities language other than English requirement and GE categories VI and VIII.",
      },
    ],
  },

  "IB History of Europe (HL)": {
    rewards: [
      // Non-U.S. History: two courses toward HISTORY 21A-21C for GE IV.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-4": 2 },
        coursesGranted: { AND: [] },
        notes:
          "Satisfies two courses toward HISTORY 21A, 21B, or 21C for GE category IV and satisfies GE category VIII. History credit applies to GE requirements only, not School of Humanities major requirements.",
      },
    ],
  },

  "IB History of Asia and Oceania (HL)": {
    rewards: [
      // Non-U.S. History: two courses toward HISTORY 21A-21C for GE IV.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-4": 2 },
        coursesGranted: { AND: [] },
        notes:
          "Satisfies two courses toward HISTORY 21A, 21B, or 21C for GE category IV and satisfies GE category VIII. History credit applies to GE requirements only, not School of Humanities major requirements.",
      },
    ],
  },

  "IB History of Africa and the Middle East (HL)": {
    rewards: [
      // Non-U.S. History: two courses toward HISTORY 21A-21C for GE IV.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: { "GE-4": 2 },
        coursesGranted: { AND: [] },
        notes:
          "Satisfies two courses toward HISTORY 21A, 21B, or 21C for GE category IV and satisfies GE category VIII. History credit applies to GE requirements only, not School of Humanities major requirements.",
      },
    ],
  },

  "IB Language B: English (HL)": {
    rewards: [
      // Elective credit only; does not satisfy Entry Level Writing.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes: "Does not satisfy the UC Entry Level Writing Requirement.",
      },
    ],
  },

  "IB Language B: Spanish (HL)": {
    rewards: [
      // Scores 5-6: SPANISH 2C.
      {
        acceptableScores: [5, 6],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["SPANISH 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Additional major credit may be awarded upon petition. Placement testing is still required for enrollment in Spanish courses.",
      },
      // Score 7: SPANISH 3.
      {
        acceptableScores: [7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["SPANISH 3"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Additional major credit may be awarded upon petition. Placement testing is still required for enrollment in Spanish courses.",
      },
    ],
  },

  // UCI awards the same credit for Language A: Literature and
  // Language A: Language and Literature, but IB treats them as separate exams.
  "IB Language A: English Literature (HL)": {
    rewards: [
      // Satisfies Entry Level Writing; no specific UCI course is granted.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes: "Satisfies the UC Entry Level Writing Requirement.",
      },
    ],
  },

  "IB Language A: English Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: English Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes: "Satisfies the UC Entry Level Writing Requirement.",
      },
    ],
  },

  "IB Language A: French Literature (HL)": {
    rewards: [
      // FRENCH 2C; also satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["FRENCH 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in French courses.",
      },
    ],
  },

  "IB Language A: French Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: French Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["FRENCH 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in French courses.",
      },
    ],
  },

  "IB Language A: Spanish Literature (HL)": {
    rewards: [
      // SPANISH 3; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["SPANISH 3"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Spanish courses.",
      },
    ],
  },

  "IB Language A: Spanish Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Spanish Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["SPANISH 3"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Spanish courses.",
      },
    ],
  },

  "IB Language A: Chinese Literature (HL)": {
    rewards: [
      // CHINESE 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["CHINESE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Chinese courses.",
      },
    ],
  },

  "IB Language A: Chinese Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Chinese Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["CHINESE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Chinese courses.",
      },
    ],
  },

  "IB Language A: Arabic Literature (HL)": {
    rewards: [
      // ARABIC 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["ARABIC 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Arabic Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Arabic Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["ARABIC 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: German Literature (HL)": {
    rewards: [
      // GERMAN 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["GERMAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: German Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: German Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["GERMAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Italian Literature (HL)": {
    rewards: [
      // ITALIAN 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["ITALIAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Italian Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Italian Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["ITALIAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Japanese Literature (HL)": {
    rewards: [
      // JAPANSE 2C; placement testing still required.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["JAPANSE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Japanese courses.",
      },
    ],
  },

  "IB Language A: Japanese Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Japanese Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["JAPANSE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Japanese courses.",
      },
    ],
  },

  "IB Language A: Korean Literature (HL)": {
    rewards: [
      // KOREAN 2C; placement testing still required.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["KOREAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Korean courses.",
      },
    ],
  },

  "IB Language A: Korean Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Korean Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["KOREAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements. Placement testing is still required for enrollment in Korean courses.",
      },
    ],
  },

  "IB Language A: Hebrew Literature (HL)": {
    rewards: [
      // Satisfies the School of Humanities language requirement.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: [] },
        notes:
          "Satisfies the School of Humanities language other than English requirement for School of Humanities majors.",
      },
    ],
  },

  "IB Language A: Persian Literature (HL)": {
    rewards: [
      // PERSIAN 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["PERSIAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Portuguese Literature (HL)": {
    rewards: [
      // Elective credit only.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Language A: Portuguese Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Portuguese Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 8,
        geGranted: {},
        coursesGranted: { AND: [] },
      },
    ],
  },

  "IB Language A: Russian Literature (HL)": {
    rewards: [
      // RUSSIAN 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["RUSSIAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Russian Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Russian Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["RUSSIAN 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Vietnamese Literature (HL)": {
    rewards: [
      // VIETMSE 2C; satisfies language and GE requirements.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["VIETMSE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },

  "IB Language A: Vietnamese Language and Literature (HL)": {
    rewards: [
      // Same credit as Language A: Vietnamese Literature.
      {
        acceptableScores: [5, 6, 7],
        unitsGranted: 8,
        electiveUnitsGranted: 0,
        geGranted: {},
        coursesGranted: { AND: ["VIETMSE 2C"] },
        notes:
          "Satisfies GE categories VI and VIII and the applicable School of Humanities and International Studies language requirements.",
      },
    ],
  },
};

export default ibExamData;
