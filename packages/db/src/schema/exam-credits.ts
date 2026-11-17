import type { ExamCoursesGrantedTree, GECategory } from "@packages/stdlib";
import { integer, json, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// (AP) Each individual exam
export const apExam = pgTable("ap_exam", {
  id: varchar("id").primaryKey(),
  catalogueName: varchar("catalogue_name"),
});

// (AP) Links exam scores to credit rewards
export const apExamToReward = pgTable(
  "ap_exam_to_reward",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: varchar("exam_id")
      .notNull()
      .references(() => apExam.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reward: uuid("reward")
      .notNull()
      .references(() => apExamReward.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex().on(table.examId, table.score)],
);

// (AP) Credit awarded for a certain group of scores
export const apExamReward = pgTable("ap_exam_reward", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitsGranted: integer("units_granted").notNull(),
  electiveUnitsGranted: integer("elective_units_granted").notNull(),
  ge1aCoursesGranted: integer("ge_1a_courses_granted").notNull().default(0),
  ge1bCoursesGranted: integer("ge_1b_courses_granted").notNull().default(0),
  ge2CoursesGranted: integer("ge_2_courses_granted").notNull().default(0),
  ge3CoursesGranted: integer("ge_3_courses_granted").notNull().default(0),
  ge4CoursesGranted: integer("ge_4_courses_granted").notNull().default(0),
  ge5aCoursesGranted: integer("ge_5a_courses_granted").notNull().default(0),
  ge5bCoursesGranted: integer("ge_5b_courses_granted").notNull().default(0),
  ge6CoursesGranted: integer("ge_6_courses_granted").notNull().default(0),
  ge7CoursesGranted: integer("ge_7_courses_granted").notNull().default(0),
  ge8CoursesGranted: integer("ge_8_courses_granted").notNull().default(0),
  coursesGranted: json("courses_granted").$type<ExamCoursesGrantedTree>().notNull(),
  notes: text("notes"),
});

// (IB) Each individual exam
export const ibExam = pgTable("ib_exam", {
  id: varchar("id").primaryKey(),
  catalogueName: varchar("catalogue_name"),
});

// (IB) Links exam scores to credit rewards
export const ibExamToReward = pgTable(
  "ib_exam_to_reward",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: varchar("exam_id")
      .notNull()
      .references(() => ibExam.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reward: uuid("reward")
      .notNull()
      .references(() => ibExamReward.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex().on(table.examId, table.score)],
);

// (IB) Credit awarded for a certain group of scores
export const ibExamReward = pgTable("ib_exam_reward", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitsGranted: integer("units_granted").notNull(),
  electiveUnitsGranted: integer("elective_units_granted").notNull(),
  ge1aCoursesGranted: integer("ge_1a_courses_granted").notNull().default(0),
  ge1bCoursesGranted: integer("ge_1b_courses_granted").notNull().default(0),
  ge2CoursesGranted: integer("ge_2_courses_granted").notNull().default(0),
  ge3CoursesGranted: integer("ge_3_courses_granted").notNull().default(0),
  ge4CoursesGranted: integer("ge_4_courses_granted").notNull().default(0),
  ge5aCoursesGranted: integer("ge_5a_courses_granted").notNull().default(0),
  ge5bCoursesGranted: integer("ge_5b_courses_granted").notNull().default(0),
  ge6CoursesGranted: integer("ge_6_courses_granted").notNull().default(0),
  ge7CoursesGranted: integer("ge_7_courses_granted").notNull().default(0),
  ge8CoursesGranted: integer("ge_8_courses_granted").notNull().default(0),
  coursesGranted: json("courses_granted").$type<ExamCoursesGrantedTree>().notNull(),
  notes: text("notes"),
});

type ExamRewardColumn = keyof typeof apExamReward.$inferSelect &
  keyof typeof ibExamReward.$inferSelect;

// Maps GE categories to their corresponding AP/IB reward columns.
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
} as const satisfies Record<GECategory, ExamRewardColumn>;
