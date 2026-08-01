import { index, jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { term } from "./websoc.ts";

export const tentativeCourseOfferingSources = ["ICS_COURSE_OFFERINGS"] as const;
export type TentativeCourseOfferingSource = (typeof tentativeCourseOfferingSources)[number];

export type TentativeAssignedInstructor = {
  status: "assigned";
  name: string;
  ucinetid: string;
};

export type TentativeTbdInstructor = {
  status: "tbd";
  name: "TBD";
  ucinetid: null;
};

export type TentativeInstructor = TentativeAssignedInstructor | TentativeTbdInstructor;

export const tentativeCourseOffering = pgTable(
  "tentative_course_offering",
  {
    source: varchar("source").$type<TentativeCourseOfferingSource>().notNull(),
    academicYear: varchar("academic_year").notNull(),
    // Course IDs are validated by importers. A foreign key would conflict with the catalogue
    // scraper's existing delete-and-reinsert refresh strategy for changed courses.
    courseId: varchar("course_id").notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    instructors: jsonb("instructors").$type<TentativeInstructor[]>().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    index("tentative_course_offering_course_id_idx").on(table.courseId),
    primaryKey({
      columns: [table.source, table.academicYear, table.courseId, table.year, table.quarter],
    }),
  ],
);
