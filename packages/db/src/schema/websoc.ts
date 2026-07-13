import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type HourMinute = { hour: number; minute: number };

export type TBAWebsocSectionMeeting = { timeIsTBA: true };

export type ConfirmedWebsocSectionMeeting = {
  timeIsTBA: false;
  bldg: string[];
  days: string;
  startTime: HourMinute;
  endTime: HourMinute;
};

export type WebsocSectionMeeting = TBAWebsocSectionMeeting | ConfirmedWebsocSectionMeeting;

export type NoneOrTBAWebsocSectionFinalExam = {
  examStatus: "NO_FINAL" | "TBA_FINAL";
};

export type ScheduledWebsocSectionFinalExam = {
  examStatus: "SCHEDULED_FINAL";
  dayOfWeek: string;
  month: number;
  day: number;
  startTime: HourMinute;
  endTime: HourMinute;
  bldg: string[];
};

export type WebsocSectionFinalExam =
  | NoneOrTBAWebsocSectionFinalExam
  | ScheduledWebsocSectionFinalExam;

export type FinalExamStatus = WebsocSectionFinalExam["examStatus"];

export const terms = ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"] as const;

export const term = pgEnum("term", terms);

export type Term = (typeof terms)[number];

export const courseLevels = ["LowerDiv", "UpperDiv", "Graduate"] as const;

export const courseLevel = pgEnum("course_level", courseLevels);

export type CourseLevel = (typeof courseLevels)[number];

export const divisions = ["Undergraduate", "Graduate"] as const;

export const division = pgEnum("division", divisions);

export type Division = (typeof divisions)[number];

export const websocStatuses = ["OPEN", "Waitl", "FULL", "NewOnly"] as const;

export const websocStatus = pgEnum("websoc_status", websocStatuses);

export type WebsocStatus = (typeof websocStatuses)[number];

export const websocSectionTypes = [
  "Act",
  "Col",
  "Dis",
  "Fld",
  "Lab",
  "Lec",
  "Qiz",
  "Res",
  "Sem",
  "Stu",
  "Tap",
  "Tut",
] as const;

export const websocSectionType = pgEnum("websoc_section_type", websocSectionTypes);

export type SectionType = (typeof websocSectionTypes)[number];

export const websocMeta = pgTable("websoc_meta", {
  name: varchar("name").primaryKey(),
  lastScraped: timestamp("last_scraped", { mode: "date", withTimezone: true }).notNull(),
});

export const websocSchool = pgTable(
  "websoc_school",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    schoolName: varchar("school_name").notNull(),
    schoolComment: text("school_comment").notNull(),
  },
  (table) => [uniqueIndex().on(table.year, table.quarter, table.schoolName)],
);

export const websocDepartment = pgTable(
  "websoc_department",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .references(() => websocSchool.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    deptCode: varchar("dept_code").notNull(),
    deptName: varchar("dept_name").notNull(),
    deptComment: text("dept_comment").notNull(),
    sectionCodeRangeComments: text("section_code_range_comments").array().notNull(),
    courseNumberRangeComments: text("course_number_range_comments").array().notNull(),
  },
  (table) => [
    index().on(table.schoolId),
    uniqueIndex().on(table.year, table.quarter, table.schoolId, table.deptCode),
  ],
);

export const websocCourse = pgTable(
  "websoc_course",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .references(() => websocDepartment.id)
      .notNull(),
    courseId: varchar("course_id")
      .notNull()
      .generatedAlwaysAs(
        (): SQL => sql`REPLACE(${websocCourse.deptCode}, ' ', '') || ${websocCourse.courseNumber}`,
      ),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    schoolName: varchar("school_name").notNull(),
    deptCode: varchar("dept_code").notNull(),
    courseTitle: varchar("course_title").notNull(),
    courseNumber: varchar("course_number").notNull(),
    courseNumeric: integer("course_numeric")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`CASE REGEXP_REPLACE(${websocCourse.courseNumber}, '\\D', '', 'g') WHEN '' THEN 0 ELSE REGEXP_REPLACE(${websocCourse.courseNumber}, '\\D', '', 'g')::INTEGER END`,
      ),
    courseComment: text("course_comment").notNull(),
    prerequisiteLink: varchar("prerequisite_link").notNull(),
    isGE1A: boolean("is_ge_1a").notNull().default(false),
    isGE1B: boolean("is_ge_1b").notNull().default(false),
    isGE2: boolean("is_ge_2").notNull().default(false),
    isGE3: boolean("is_ge_3").notNull().default(false),
    isGE4: boolean("is_ge_4").notNull().default(false),
    isGE5A: boolean("is_ge_5a").notNull().default(false),
    isGE5B: boolean("is_ge_5b").notNull().default(false),
    isGE6: boolean("is_ge_6").notNull().default(false),
    isGE7: boolean("is_ge_7").notNull().default(false),
    isGE8: boolean("is_ge_8").notNull().default(false),
  },
  (table) => [
    index().on(table.departmentId),
    index().on(table.courseId),
    uniqueIndex().on(
      table.year,
      table.quarter,
      table.schoolName,
      table.deptCode,
      table.courseNumber,
      table.courseTitle,
    ),
    index().on(table.year, table.quarter, table.isGE1A),
    index().on(table.year, table.quarter, table.isGE1B),
    index().on(table.year, table.quarter, table.isGE2),
    index().on(table.year, table.quarter, table.isGE3),
    index().on(table.year, table.quarter, table.isGE4),
    index().on(table.year, table.quarter, table.isGE5A),
    index().on(table.year, table.quarter, table.isGE5B),
    index().on(table.year, table.quarter, table.isGE6),
    index().on(table.year, table.quarter, table.isGE7),
    index().on(table.year, table.quarter, table.isGE8),
    index().on(table.year, table.quarter, table.deptCode),
    index().on(table.year, table.quarter, table.deptCode, table.courseNumber),
  ],
);

export const websocSection = pgTable(
  "websoc_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => websocCourse.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    units: varchar("units").notNull(),
    status: websocStatus("status"),
    instructors: text("instructors").array().notNull(),
    meetings: json("meetings").$type<WebsocSectionMeeting[]>().notNull(),
    finalExamString: varchar("final_exam_string").notNull(),
    finalExam: json("final_exam").$type<WebsocSectionFinalExam>().notNull(),
    sectionNum: varchar("section_num").notNull(),
    maxCapacity: integer("max_capacity").notNull(),
    sectionCode: integer("section_code").notNull(),
    sectionType: websocSectionType("section_type").notNull(),
    numRequested: integer("num_requested").notNull(),
    restrictions: varchar("restriction_string").notNull(),
    restrictionA: boolean("restriction_a").notNull().default(false),
    restrictionB: boolean("restriction_b").notNull().default(false),
    restrictionC: boolean("restriction_c").notNull().default(false),
    restrictionD: boolean("restriction_d").notNull().default(false),
    restrictionE: boolean("restriction_e").notNull().default(false),
    restrictionF: boolean("restriction_f").notNull().default(false),
    restrictionG: boolean("restriction_g").notNull().default(false),
    restrictionH: boolean("restriction_h").notNull().default(false),
    restrictionI: boolean("restriction_i").notNull().default(false),
    restrictionJ: boolean("restriction_j").notNull().default(false),
    restrictionK: boolean("restriction_k").notNull().default(false),
    restrictionL: boolean("restriction_l").notNull().default(false),
    restrictionM: boolean("restriction_m").notNull().default(false),
    restrictionN: boolean("restriction_n").notNull().default(false),
    restrictionO: boolean("restriction_o").notNull().default(false),
    restrictionR: boolean("restriction_r").notNull().default(false),
    restrictionS: boolean("restriction_s").notNull().default(false),
    restrictionX: boolean("restriction_x").notNull().default(false),
    numOnWaitlist: integer("num_on_waitlist"),
    numWaitlistCap: integer("num_waitlist_cap"),
    sectionComment: text("section_comment").notNull(),
    numNewOnlyReserved: integer("num_new_only_reserved"),
    numCurrentlyTotalEnrolled: integer("num_currently_total_enrolled"),
    numCurrentlySectionEnrolled: integer("num_currently_section_enrolled"),
    isCancelled: boolean("is_cancelled")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`${websocSection.sectionComment} LIKE \'%***  CANCELLED  ***%\' OR ${websocSection.sectionComment} LIKE \'%***  CANCELED  ***%\'`,
      ),
    webURL: text("web_url").notNull().default(""),
  },
  (table) => [
    index().on(table.courseId),
    uniqueIndex().on(table.year, table.quarter, table.sectionCode),
  ],
);

export const websocSectionMeeting = pgTable(
  "websoc_section_meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sectionCode: integer("section_code").notNull(),
    meetingIndex: integer("meeting_index").notNull(),
    timeString: varchar("time_string").notNull(),
    timeIsTBA: boolean("time_is_tba")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`${websocSectionMeeting.timeString} LIKE \'%TBA%\'`),
    startTime: timestamp("start_time", { mode: "date" }),
    endTime: timestamp("end_time", { mode: "date" }),
    daysString: varchar("days_string").notNull(),
    meetsMonday: boolean("meets_monday").notNull().default(false),
    meetsTuesday: boolean("meets_tuesday").notNull().default(false),
    meetsWednesday: boolean("meets_wednesday").notNull().default(false),
    meetsThursday: boolean("meets_thursday").notNull().default(false),
    meetsFriday: boolean("meets_friday").notNull().default(false),
    meetsSaturday: boolean("meets_saturday").notNull().default(false),
    meetsSunday: boolean("meets_sunday").notNull().default(false),
  },
  (table) => [index().on(table.sectionId)],
);

export const websocLocation = pgTable(
  "websoc_location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    building: varchar("building").notNull(),
    room: varchar("room").notNull(),
  },
  (table) => [uniqueIndex().on(table.building, table.room)],
);

export const websocInstructor = pgTable("websoc_instructor", {
  name: varchar("name").primaryKey(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const websocSectionToInstructor = pgTable(
  "websoc_section_to_instructor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    instructorName: varchar("instructor_name")
      .references(() => websocInstructor.name)
      .notNull(),
  },
  (table) => [index().on(table.sectionId), index().on(table.instructorName)],
);

export const websocSectionMeetingToLocation = pgTable(
  "websoc_section_meeting_to_location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .references(() => websocSectionMeeting.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => websocLocation.id)
      .notNull(),
  },
  (table) => [
    index().on(table.meetingId),
    index().on(table.locationId),
    uniqueIndex().on(table.meetingId, table.locationId),
  ],
);

export const websocSectionEnrollment = pgTable(
  "websoc_section_enrollment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    createdAt: date("created_at", { mode: "date" }).defaultNow().notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    maxCapacity: integer("max_capacity").notNull(),
    numCurrentlyTotalEnrolled: integer("num_currently_total_enrolled"),
    numOnWaitlist: integer("num_on_waitlist"),
    numWaitlistCap: integer("num_waitlist_cap"),
    numRequested: integer("num_requested"),
    numNewOnlyReserved: integer("num_new_only_reserved"),
    status: websocStatus("status"),
  },
  (table) => [index().on(table.sectionId), uniqueIndex().on(table.sectionId, table.createdAt)],
);

export const websocSectionGrade = pgTable(
  "websoc_section_grade",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .unique()
      .notNull(),
    gradeACount: integer("grade_a_count").notNull(),
    gradeBCount: integer("grade_b_count").notNull(),
    gradeCCount: integer("grade_c_count").notNull(),
    gradeDCount: integer("grade_d_count").notNull(),
    gradeFCount: integer("grade_f_count").notNull(),
    gradePCount: integer("grade_p_count").notNull(),
    gradeNPCount: integer("grade_np_count").notNull(),
    gradeWCount: integer("grade_w_count").notNull(),
    averageGPA: decimal("average_gpa", { precision: 3, scale: 2 }),
  },
  (table) => [index().on(table.sectionId)],
);
