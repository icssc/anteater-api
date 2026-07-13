import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  real,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { term, websocCourse } from "./websoc.ts";

export * from "./ap-exams.ts";
export * from "./course-materials.ts";
export * from "./courses.ts";
export * from "./degreeworks.ts";
export * from "./dining.ts";
export * from "./instructors.ts";
export * from "./sample-programs.ts";
export * from "./study-rooms.ts";
export * from "./websoc.ts";

export const larcSection = pgTable(
  "larc_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => websocCourse.id)
      .notNull(),
    daysString: varchar("days_string").notNull(),
    timeString: varchar("time_string").notNull(),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }).notNull(),
    instructor: varchar("instructor").notNull(),
    building: varchar("building").notNull(),
    meetsMonday: boolean("meets_monday").notNull().default(false),
    meetsTuesday: boolean("meets_tuesday").notNull().default(false),
    meetsWednesday: boolean("meets_wednesday").notNull().default(false),
    meetsThursday: boolean("meets_thursday").notNull().default(false),
    meetsFriday: boolean("meets_friday").notNull().default(false),
    meetsSaturday: boolean("meets_saturday").notNull().default(false),
    meetsSunday: boolean("meets_sunday").notNull().default(false),
  },
  (table) => [index().on(table.courseId)],
);

export const calendarTerm = pgTable("calendar_term", {
  id: varchar("id")
    .primaryKey()
    .generatedAlwaysAs(
      (): SQL =>
        sql`${calendarTerm.year} || ' ' || CASE WHEN ${calendarTerm.quarter} = 'Fall' THEN 'Fall' WHEN ${calendarTerm.quarter} = 'Winter' THEN 'Winter' WHEN ${calendarTerm.quarter} = 'Spring' THEN 'Spring' WHEN ${calendarTerm.quarter} = 'Summer1' THEN 'Summer1' WHEN ${calendarTerm.quarter} = 'Summer10wk' THEN 'Summer10wk' WHEN ${calendarTerm.quarter} = 'Summer2' THEN 'Summer2' ELSE '' END`,
    ),
  year: varchar("year").notNull(),
  quarter: term("quarter").notNull(),
  instructionStart: date("instruction_start", { mode: "date" }).notNull(),
  instructionEnd: date("instruction_end", { mode: "date" }).notNull(),
  finalsStart: date("finals_start", { mode: "date" }).notNull(),
  finalsEnd: date("finals_end", { mode: "date" }).notNull(),
  socAvailable: date("soc_available", { mode: "date" }).notNull(),
});

export const libraryTraffic = pgTable(
  "library_traffic",
  {
    id: integer("id").primaryKey(),
    libraryName: varchar("library_name").notNull(),
    locationName: varchar("location_name").notNull(),
    trafficCount: integer("traffic_count").notNull(),
    trafficPercentage: real("traffic_percentage").notNull(),
    timestamp: timestamp("timestamp").notNull(),
  },
  (table) => [index().on(table.libraryName), index().on(table.locationName)],
);

export const libraryTrafficHistory = pgTable(
  "library_traffic_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: integer("location_id")
      .references(() => libraryTraffic.id, { onDelete: "cascade" })
      .notNull(),
    trafficCount: integer("traffic_count").notNull(),
    trafficPercentage: real("traffic_percentage").notNull(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [uniqueIndex().on(table.locationId, table.timestamp)],
);
