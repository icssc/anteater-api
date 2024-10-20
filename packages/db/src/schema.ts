import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
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

// Types

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

export type CoursePrerequisite = {
  prereqType: "course";
  coreq: false;
  courseId: string;
  minGrade?: string;
};

export type CourseCorequisite = {
  prereqType: "course";
  coreq: true;
  courseId: string;
};

export type ExamPrerequisite = {
  prereqType: "exam";
  examName: string;
  minGrade?: string;
};

export type Prerequisite = CoursePrerequisite | CourseCorequisite | ExamPrerequisite;

export type PrerequisiteTree = {
  AND?: Array<Prerequisite | PrerequisiteTree>;
  OR?: Array<Prerequisite | PrerequisiteTree>;
  NOT?: Array<Prerequisite | PrerequisiteTree>;
};

export type DegreeWorksProgramId = {
  school: "U" | "G";
  programType: "MAJOR" | "MINOR" | "SPEC";
  code: string;
  degreeType?: string;
};

export type DegreeWorksProgram = DegreeWorksProgramId & {
  name: string;
  requirements: Record<string, DegreeWorksRequirement>;
  /**
   * The set of specializations (if any) that this program has.
   * If this array is not empty, then exactly one specialization must be selected
   * to fulfill the requirements of the program.
   */
  specs: string[];
};

export type DegreeWorksCourseRequirement = {
  requirementType: "Course";
  courseCount: number;
  courses: string[];
};

export type DegreeWorksUnitRequirement = {
  requirementType: "Unit";
  unitCount: number;
  courses: string[];
};

export type DegreeWorksGroupRequirement = {
  requirementType: "Group";
  requirementCount: number;
  requirements: Record<string, DegreeWorksRequirement>;
};

export type DegreeWorksRequirement =
  | DegreeWorksCourseRequirement
  | DegreeWorksUnitRequirement
  | DegreeWorksGroupRequirement;

// Misc. enums

export const terms = ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"] as const;
export const term = pgEnum("term", terms);
export type Term = (typeof terms)[number];

export const courseLevels = ["LowerDiv", "UpperDiv", "Graduate"] as const;
export const courseLevel = pgEnum("course_level", courseLevels);
export type CourseLevel = (typeof courseLevels)[number];

export const divisions = ["Undergraduate", "Graduate"] as const;
export const division = pgEnum("division", divisions);
export type Division = (typeof divisions)[number];

// WebSoc enums

export const websocStatuses = ["OPEN", "Waitl", "FULL", "NewOnly"] as const;
export const websocStatus = pgEnum("websoc_status", websocStatuses);
export type WebsocStatus = (typeof websocStatuses)[number];

export const finalExamStatuses = ["SCHEDULED_FINAL", "TBA_FINAL", "NO_FINAL"] as const;
export const finalExamStatus = pgEnum("final_exam_status", finalExamStatuses);
export type FinalExamStatus = (typeof finalExamStatuses)[number];

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

// Primary WebSoc tables

export const websocMeta = pgTable("websoc_meta", {
  name: varchar("name").primaryKey(),
  lastScraped: timestamp("last_scraped", { mode: "date", withTimezone: true }).notNull(),
});

export const websocSchool = pgTable(
  "websoc_school",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    schoolName: varchar("school_name").notNull(),
    schoolComment: text("school_comment").notNull(),
  },
  (table) => ({
    idx: uniqueIndex("websoc_school_idx").on(table.year, table.quarter, table.schoolName),
  }),
);

export const websocDepartment = pgTable(
  "websoc_department",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .references(() => websocSchool.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    year: varchar("year").notNull(),
    quarter: term("quarter").notNull(),
    deptCode: varchar("dept_code").notNull(),
    deptName: varchar("dept_name").notNull(),
    deptComment: text("dept_comment").notNull(),
    sectionCodeRangeComments: text("section_code_range_comments").array().notNull(),
    courseNumberRangeComments: text("course_number_range_comments").array().notNull(),
  },
  (table) => ({
    schoolIdx: index("school_idx").on(table.schoolId),
    idx: uniqueIndex("websoc_department_idx").on(
      table.year,
      table.quarter,
      table.schoolId,
      table.deptCode,
    ),
  }),
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
      .generatedAlwaysAs((): SQL => sql`${websocCourse.deptCode} || ${websocCourse.courseNumber}`),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
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
  (table) => ({
    deptIdx: index("dept_idx").on(table.departmentId),
    courseIdx: index("websoc_course_course_id_idx").on(table.courseId),
    idx: uniqueIndex("websoc_course_idx").on(
      table.year,
      table.quarter,
      table.schoolName,
      table.deptCode,
      table.courseNumber,
      table.courseTitle,
    ),
    ge1AQueryIdx: index("ge_1a_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge1BQueryIdx: index("ge_1b_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge2QueryIdx: index("ge_2_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge3QueryIdx: index("ge_3_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge4QueryIdx: index("ge_4_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge5AQueryIdx: index("ge_5a_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge5BQueryIdx: index("ge_5b_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge6QueryIdx: index("ge_6_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge7QueryIdx: index("ge_7_query_idx").on(table.year, table.quarter, table.isGE1A),
    ge8QueryIdx: index("ge_8_query_idx").on(table.year, table.quarter, table.isGE1A),
    deptQueryIdx: index("dept_query_idx").on(table.year, table.quarter, table.deptCode),
    courseQueryIdx: index("course_query_idx").on(
      table.year,
      table.quarter,
      table.deptCode,
      table.courseNumber,
    ),
  }),
);

export const websocSection = pgTable(
  "websoc_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => websocCourse.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
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
        (): SQL => sql`${websocSection.sectionComment} LIKE \'*** CANCELLED ***%\'`,
      ),
  },
  (table) => ({
    courseIdx: index("course_idx").on(table.courseId),
    idx: uniqueIndex("websoc_section_idx").on(table.year, table.quarter, table.sectionCode),
  }),
);

export const websocSectionMeeting = pgTable(
  "websoc_section_meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    sectionCode: integer("section_code").notNull(),
    meetingIndex: integer("meeting_index").notNull(),
    timeString: varchar("time_string").notNull(),
    timeIsTBA: boolean("time_is_tba")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`${websocSectionMeeting.timeString} LIKE \'%TBA%\'`),
    startTime: timestamp("start_time", { mode: "date" }),
    endTime: timestamp("end_time", { mode: "date" }),
    daysString: varchar("days_string").notNull(),
    meetsMonday: boolean("meets_monday"),
    meetsTuesday: boolean("meets_tuesday"),
    meetsWednesday: boolean("meets_wednesday"),
    meetsThursday: boolean("meets_thursday"),
    meetsFriday: boolean("meets_friday"),
    meetsSaturday: boolean("meets_saturday"),
    meetsSunday: boolean("meets_sunday"),
  },
  (table) => ({
    sectionIdx: index("section_idx").on(table.sectionId),
  }),
);

export const websocLocation = pgTable(
  "websoc_location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    building: varchar("building").notNull(),
    room: varchar("room").notNull(),
  },
  (table) => ({ idx: uniqueIndex("websoc_location_idx").on(table.building, table.room) }),
);

export const websocInstructor = pgTable("websoc_instructor", {
  name: varchar("name").primaryKey(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
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
  (table) => ({
    sectionIdx: index("websoc_section_to_instructor_section_idx").on(table.sectionId),
    instructorIdx: index("websoc_section_to_instructor_instructor_idx").on(table.instructorName),
  }),
);

export const websocSectionMeetingToLocation = pgTable(
  "websoc_section_meeting_to_location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("section_id")
      .references(() => websocSectionMeeting.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => websocLocation.id)
      .notNull(),
  },
  (table) => ({
    meetingIdx: index("meeting_idx").on(table.meetingId),
    locationIdx: index("location_idx").on(table.locationId),
    idx: uniqueIndex("websoc_section_meeting_to_location_idx").on(
      table.meetingId,
      table.locationId,
    ),
  }),
);

// WebSoc-adjacent data tables

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
  (table) => ({
    sectionIdx: index("meeting_section_idx").on(table.sectionId),
    idx: uniqueIndex("websoc_section_enrollment_idx").on(table.sectionId, table.createdAt),
  }),
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
  (table) => ({ sectionIdx: index("grade_section_idx").on(table.sectionId) }),
);

export const larcSection = pgTable(
  "larc_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .references(() => websocCourse.id)
      .notNull(),
    days: varchar("days").notNull(),
    time: varchar("time").notNull(),
    instructor: varchar("instructor").notNull(),
    bldg: varchar("bldg").notNull(),
  },
  (table) => ({ courseIdx: index("larc_section_course_idx").on(table.courseId) }),
);

// Course/Instructor tables

export const course = pgTable("course", {
  id: varchar("id").primaryKey(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  department: varchar("department").notNull(),
  courseNumber: varchar("course_number").notNull(),
  courseNumeric: integer("course_numeric")
    .notNull()
    .generatedAlwaysAs(
      (): SQL =>
        sql`CASE REGEXP_REPLACE(${course.courseNumber}, '\\D', '', 'g') WHEN '' THEN 0 ELSE REGEXP_REPLACE(${course.courseNumber}, '\\D', '', 'g')::INTEGER END`,
    ),
  school: varchar("school").notNull(),
  title: varchar("title").notNull(),
  courseLevel: courseLevel("course_level").notNull(),
  minUnits: decimal("min_units", { precision: 4, scale: 2 }).notNull(),
  maxUnits: decimal("max_units", { precision: 4, scale: 2 }).notNull(),
  description: text("description").notNull(),
  departmentName: varchar("department_name").notNull(),
  prerequisiteTree: json("prerequisite_tree").$type<PrerequisiteTree>().notNull(),
  prerequisiteText: text("prerequisite_text").notNull(),
  repeatability: varchar("repeatability").notNull(),
  gradingOption: varchar("grading_option").notNull(),
  concurrent: varchar("concurrent").notNull(),
  sameAs: varchar("same_as").notNull(),
  restriction: text("restriction").notNull(),
  overlap: text("overlap").notNull(),
  corequisites: text("corequisites").notNull(),
  isGE1A: boolean("is_ge_1a").notNull(),
  isGE1B: boolean("is_ge_1b").notNull(),
  isGE2: boolean("is_ge_2").notNull(),
  isGE3: boolean("is_ge_3").notNull(),
  isGE4: boolean("is_ge_4").notNull(),
  isGE5A: boolean("is_ge_5a").notNull(),
  isGE5B: boolean("is_ge_5b").notNull(),
  isGE6: boolean("is_ge_6").notNull(),
  isGE7: boolean("is_ge_7").notNull(),
  isGE8: boolean("is_ge_8").notNull(),
  geText: varchar("ge_text").notNull(),
});

export const instructor = pgTable("instructor", {
  ucinetid: varchar("ucinetid").primaryKey(),
  name: varchar("name").notNull(),
  title: varchar("title").notNull(),
  email: varchar("email").notNull(),
  department: varchar("department").notNull(),
});

export const prerequisite = pgTable(
  "prerequisite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dependencyDept: varchar("dep_dept").notNull(),
    prerequisiteId: varchar("prerequisite_id").notNull(),
    dependencyId: varchar("dependency_id").notNull(),
  },
  (table) => ({
    dependencyDeptIdx: index("dependency_dept_idx").on(table.dependencyDept),
    prereqIdx: index("prereq_id_idx").on(table.prerequisiteId),
    dependIdx: index("depend_id_idx").on(table.dependencyId),
    idx: uniqueIndex("prerequisite_idx").on(table.prerequisiteId, table.dependencyId),
  }),
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
  (table) => ({
    instructorIdx: index("instructor_idx").on(table.instructorUcinetid),
    websocInstructorIdx: index("websoc_instructor_idx").on(table.websocInstructorName),
    idx: uniqueIndex("instructor_to_websoc_instructor_idx").on(
      table.instructorUcinetid,
      table.websocInstructorName,
    ),
  }),
);

// DegreeWorks data tables

export const degree = pgTable("degree", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  division: division("division").notNull(),
});

export const major = pgTable(
  "major",
  {
    id: varchar("id").primaryKey(),
    degreeId: varchar("degree_id")
      .references(() => degree.id)
      .notNull(),
    code: varchar("code").notNull(),
    name: varchar("name").notNull(),
    requirements: json("requirements").$type<Record<string, DegreeWorksRequirement>>().notNull(),
  },
  (table) => ({ degreeIdx: index("degree_idx").on(table.degreeId) }),
);

export const minor = pgTable("minor", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  requirements: json("requirements").$type<Record<string, DegreeWorksRequirement>>().notNull(),
});

export const specialization = pgTable(
  "specialization",
  {
    id: varchar("id").primaryKey(),
    majorId: varchar("major_id")
      .references(() => major.id)
      .notNull(),
    name: varchar("name").notNull(),
    requirements: json("requirements").$type<Record<string, DegreeWorksRequirement>>().notNull(),
  },
  (table) => ({ majorIdx: index("major_idx").on(table.majorId) }),
);

// Misc. tables

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
    capacity: integer("capacity").notNull(),
    location: varchar("location").notNull(),
    description: varchar("description").notNull(),
    directions: varchar("directions").notNull(),
    techEnhanced: boolean("tech_enhanced").notNull(),
    studyLocationId: varchar("study_location_id")
      .references(() => studyLocation.id)
      .notNull(),
  },
  (table) => ({ studyLocationIdx: index("study_location_idx").on(table.studyLocationId) }),
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
  (table) => ({
    studyRoomIdx: index("study_room_idx").on(table.studyRoomId),
  }),
);
