import { eq, getTableColumns, ne, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  json,
  jsonb,
  pgMaterializedView,
  pgTable,
  real,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { courses } from "./courses.ts";
import {
  term,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "./websoc.ts";

export * from "./course-materials.ts";
export * from "./courses.ts";
export * from "./degreeworks.ts";
export * from "./dining.ts";
export * from "./websoc.ts";

export const StandingYear = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
export type StandingYearType = (typeof StandingYear)[number];

export type CourseEntry = { type: "courseId"; value: string } | { type: "unknown"; value: string };

export type SampleProgramEntry = {
  year: StandingYearType;
  fall: CourseEntry[];
  winter: CourseEntry[];
  spring: CourseEntry[];
};

export const catalogProgram = pgTable("catalogue_program", {
  id: varchar("id").primaryKey(),
  programName: varchar("program_name").notNull(),
});

export const sampleProgramVariation = pgTable("sample_program_variation", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: varchar("program_id")
    .notNull()
    .references(() => catalogProgram.id, { onDelete: "cascade" }),
  label: varchar("label"),
  sampleProgram: jsonb("sample_program").$type<SampleProgramEntry[]>().notNull(),
  variationNotes: varchar("variation_notes").array().notNull().default(sql`ARRAY[]::VARCHAR[]`),
});

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

export const instructor = pgTable(
  "instructor",
  {
    ucinetid: varchar("ucinetid").primaryKey(),
    name: varchar("name").notNull(),
    title: varchar("title").notNull(),
    email: varchar("email").notNull(),
    department: varchar("department").notNull(),
  },
  (table) => [
    index("instructor_search_index").using(
      "gin",
      sql`(
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.ucinetid}, '')), 'A') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.name}, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.title}, '')), 'B')
)`,
    ),
  ],
);

export const instructorToWebsocInstructor = pgTable(
  "instructor_to_websoc_instructor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorUcinetid: varchar("instructor_ucinetid").references(() => instructor.ucinetid),
    websocInstructorName: varchar("websoc_instructor_name")
      .notNull()
      .references(() => websocInstructor.name),
  },
  (table) => [
    index().on(table.instructorUcinetid),
    index().on(table.websocInstructorName),
    uniqueIndex().on(table.instructorUcinetid, table.websocInstructorName),
  ],
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

export const studyLocation = pgTable("study_location", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
});

export const studyRoom = pgTable(
  "study_room",
  {
    id: varchar("id").primaryKey(),
    name: varchar("name").notNull(),
    capacity: integer("capacity"),
    location: varchar("location").notNull(),
    description: varchar("description").notNull(),
    directions: varchar("directions").notNull(),
    techEnhanced: boolean("tech_enhanced"),
    url: varchar("url"),
    studyLocationId: varchar("study_location_id")
      .references(() => studyLocation.id)
      .notNull(),
  },
  (table) => [index().on(table.studyLocationId)],
);

export const studyRoomSlot = pgTable(
  "study_room_slot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyRoomId: varchar("study_room_id")
      .references(() => studyRoom.id)
      .notNull(),
    start: timestamp("start", { mode: "date" }).notNull(),
    end: timestamp("end", { mode: "date" }).notNull(),
    isAvailable: boolean("is_available").notNull(),
  },
  (table) => [
    index().on(table.studyRoomId),
    uniqueIndex().on(table.studyRoomId, table.start, table.end),
  ],
);

export type APCoursesGrantedTree =
  | {
      AND: (APCoursesGrantedTree | string)[];
    }
  | {
      OR: (APCoursesGrantedTree | string)[];
    };

export const apExam = pgTable("ap_exam", {
  id: varchar("id").primaryKey(),
  catalogueName: varchar("catalogue_name"),
});

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
  coursesGranted: json("courses_granted").$type<APCoursesGrantedTree>().notNull(),
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

export const instructorView = pgMaterializedView("instructor_view").as((qb) => {
  const shortenedNamesCte = qb.$with("shortened_names_cte").as(
    qb
      .select({
        instructorUcinetid: instructorToWebsocInstructor.instructorUcinetid,
        shortenedNames: sql`ARRAY_AGG(${instructorToWebsocInstructor.websocInstructorName})`.as(
          "shortened_names",
        ),
      })
      .from(instructorToWebsocInstructor)
      .groupBy(instructorToWebsocInstructor.instructorUcinetid),
  );
  const termsCte = qb.$with("terms_cte").as(
    qb
      .select({
        courseId: courses.id,
        instructorUcinetid: instructorToWebsocInstructor.instructorUcinetid,
        terms: sql`
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT
            CASE WHEN ${websocCourse.year} IS NULL THEN NULL
            ELSE CONCAT(${websocCourse.year}, ' ', ${websocCourse.quarter})
            END
          ), NULL)`.as("terms"),
      })
      .from(courses)
      .leftJoin(websocCourse, eq(websocCourse.courseId, courses.id))
      .leftJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.sectionId, websocSection.id),
      )
      .leftJoin(
        websocInstructor,
        eq(websocInstructor.name, websocSectionToInstructor.instructorName),
      )
      .leftJoin(
        instructorToWebsocInstructor,
        eq(instructorToWebsocInstructor.websocInstructorName, websocInstructor.name),
      )
      .groupBy(courses.id, instructorToWebsocInstructor.instructorUcinetid),
  );
  const coursesCte = qb.$with("courses_cte").as(
    qb
      .with(termsCte)
      .select({
        instructorUcinetid: termsCte.instructorUcinetid,
        courseId: courses.id,
        courseInfo: sql`
          CASE WHEN ${courses.id} IS NULL
          THEN NULL
          ELSE JSONB_BUILD_OBJECT(
               'id', ${courses.id},
               'title', ${courses.title},
               'department', ${courses.department},
               'courseNumber', ${courses.courseNumber},
               'terms', COALESCE(${termsCte.terms}, ARRAY[]::TEXT[])
          )
          END
          `.as("course_info"),
      })
      .from(courses)
      .leftJoin(termsCte, eq(termsCte.courseId, courses.id))
      .groupBy(courses.id, termsCte.instructorUcinetid, termsCte.terms),
  );
  return qb
    .with(shortenedNamesCte, coursesCte)
    .select({
      ...getTableColumns(instructor),
      shortenedNames: sql<
        string[]
      >`COALESCE(${shortenedNamesCte.shortenedNames}, ARRAY[]::TEXT[])`.as("shortened_names"),
      courses: sql`
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT ${coursesCte.courseInfo}), NULL)
        `.as("courses"),
    })
    .from(instructor)
    .leftJoin(shortenedNamesCte, eq(shortenedNamesCte.instructorUcinetid, instructor.ucinetid))
    .leftJoin(coursesCte, eq(coursesCte.instructorUcinetid, instructor.ucinetid))
    .where(ne(instructor.ucinetid, "student"))
    .groupBy(instructor.ucinetid, shortenedNamesCte.shortenedNames);
});
