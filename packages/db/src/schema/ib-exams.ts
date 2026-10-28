import type { CoursesGrantedTree } from "@packages/stdlib";
import { integer, json, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// Each individual IB exam
export const ibExam = pgTable("ib_exam", {
  id: varchar("id").primaryKey(),
  catalogueName: varchar("catalogue_name"),
});

// Links exam scores to credit rewards
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

// Credit awarded for a certain group of scores
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

  coursesGranted: json("courses_granted").$type<CoursesGrantedTree>().notNull(),

  notes: text("notes"),
});
