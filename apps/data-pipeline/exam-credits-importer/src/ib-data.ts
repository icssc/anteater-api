// https://catalogue.uci.edu/informationforprospectivestudents/undergraduateadmissions/#advancedplacementandinternationalbaccalaureatecredittext

import type { Exam } from "@packages/stdlib";

export type IBExamMapping = Record<string, Exam<5 | 6 | 7>>;

// Initial examples, add remaining subjects later.
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

  "IB Business & Management (HL)": {
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

  "IB Dance (HL)": {
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

  "IB Film (HL)": {
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

  "IB Global Politics (HL)": {
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

  "IB Music (HL)": {
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

  "IB Philosophy (HL)": {
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

  "IB Theater Arts (HL)": {
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

  "IB Visual Arts (HL)": {
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
};

export default ibExamData;
