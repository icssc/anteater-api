import type { SQL } from "drizzle-orm";
import { and, eq, getTableColumns, isNotNull, ne, sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgMaterializedView,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { aliasedTable } from "./drizzle.ts";

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

export type FinalExamStatus = "SCHEDULED_FINAL" | "TBA_FINAL" | "NO_FINAL";

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
  programType: "COLLEGE" | "MAJOR" | "MINOR" | "SPEC";
  code: string;
  degreeType?: string;
};

export type DegreeWorksProgram = DegreeWorksProgramId & {
  name: string;
  requirements: DegreeWorksRequirement[];
  /**
   * The set of specializations (if any) that this program has.
   * If this array is not empty, then exactly one specialization must be selected
   * to fulfill the requirements of the program.
   */
  specs: string[];
};

/**
 * (school, major) pair, because school requirements can vary by major
 * eventually, we may want degree type; e.g. MFA provides some requirements
 */
export type MajorProgram = [DegreeWorksProgram | undefined, DegreeWorksProgram];

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
  requirements: DegreeWorksRequirement[];
};

export type DegreeWorksMarkerRequirement = {
  requirementType: "Marker";
};

export type DegreeWorksRequirementBase = { label: string };

export type DegreeWorksRequirement = DegreeWorksRequirementBase &
  (
    | DegreeWorksCourseRequirement
    | DegreeWorksUnitRequirement
    | DegreeWorksGroupRequirement
    | DegreeWorksMarkerRequirement
  );

export type APCoursesGrantedTree =
  | {
      AND: (APCoursesGrantedTree | string)[];
    }
  | {
      OR: (APCoursesGrantedTree | string)[];
    };

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
  lastDeptScraped: varchar("last_dept_scraped"),
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
        (): SQL => sql`${websocSection.sectionComment} LIKE \'*** CANCELLED ***%\'`,
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
    meetingId: uuid("section_id")
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

// Course/Instructor tables

export const course = pgTable(
  "course",
  {
    id: varchar("id").primaryKey(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    department: varchar("department").notNull(),
    shortenedDept: varchar("shortened_dept")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`REPLACE(${course.department}, ' ', '')`),
    departmentAlias: varchar("department_alias"),
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
  },
  (table) => [
    index("course_search_index").using(
      "gin",
      sql`(
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.id}, '')), 'A') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.department}, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.departmentAlias}, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.shortenedDept}, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.courseNumber}, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.courseNumeric}::TEXT, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.title}, '')), 'C') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE(${table.description}, '')), 'D')
)`,
    ),
    index("shortened_dept").on(table.shortenedDept),
  ],
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

export const prerequisite = pgTable(
  "prerequisite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dependencyDept: varchar("dep_dept").notNull(),
    prerequisiteId: varchar("prerequisite_id").notNull(),
    dependencyId: varchar("dependency_id").notNull(),
  },
  (table) => [
    index().on(table.dependencyDept),
    index().on(table.prerequisiteId),
    index().on(table.dependencyId),
    uniqueIndex().on(table.prerequisiteId, table.dependencyId),
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

// DegreeWorks data tables

export const degree = pgTable("degree", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  division: division("division").notNull(),
});

export const schoolRequirement = pgTable("school_requirement", {
  id: varchar("id").primaryKey(),
  requirements: json("requirements").$type<DegreeWorksRequirement[]>().notNull(),
});

export const collegeRequirement = pgTable("college_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").notNull(),
  requirements: jsonb("requirements").$type<DegreeWorksRequirement[]>().unique().notNull(),
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
    collegeRequirement: uuid("college_requirement").references(() => collegeRequirement.id),
    requirements: json("requirements").$type<DegreeWorksRequirement[]>().notNull(),
  },
  (table) => [index().on(table.degreeId), index().on(table.collegeRequirement)],
);

export const minor = pgTable("minor", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  requirements: json("requirements").$type<DegreeWorksRequirement[]>().notNull(),
});

export const specialization = pgTable(
  "specialization",
  {
    id: varchar("id").primaryKey(),
    majorId: varchar("major_id")
      .references(() => major.id)
      .notNull(),
    name: varchar("name").notNull(),
    requirements: json("requirements").$type<DegreeWorksRequirement[]>().notNull(),
  },
  (table) => [index().on(table.majorId)],
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
  grantsGE1A: boolean("grants_ge_1a").notNull().default(false),
  grantsGE1B: boolean("grants_ge_1b").notNull().default(false),
  grantsGE2: boolean("grants_ge_2").notNull().default(false),
  grantsGE3: boolean("grants_ge_3").notNull().default(false),
  grantsGE4: boolean("grants_ge_4").notNull().default(false),
  grantsGE5A: boolean("grants_ge_5a").notNull().default(false),
  grantsGE5B: boolean("grants_ge_5b").notNull().default(false),
  grantsGE6: boolean("grants_ge_6").notNull().default(false),
  grantsGE7: boolean("grants_ge_7").notNull().default(false),
  grantsGE8: boolean("grants_ge_8").notNull().default(false),
  coursesGranted: json("courses_granted").$type<APCoursesGrantedTree>().notNull(),
});

// Materialized views

export const courseView = pgMaterializedView("course_view").as((qb) => {
  const dependency = aliasedTable(prerequisite, "dependency");
  const prerequisiteCourse = aliasedTable(course, "prerequisite_course");
  const dependencyCourse = aliasedTable(course, "dependency_course");
  return qb
    .select({
      ...getTableColumns(course),
      prerequisites: sql`
        ARRAY_REMOVE(COALESCE(
          (
            SELECT ARRAY_AGG(
              CASE WHEN ${prerequisiteCourse.id} IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
              'id', ${prerequisiteCourse.id},
              'title', ${prerequisiteCourse.title},
              'department', ${prerequisiteCourse.department},
              'courseNumber', ${prerequisiteCourse.courseNumber}
              )
              END
            )
            FROM ${prerequisite}
            LEFT JOIN ${course} ${prerequisiteCourse} ON ${prerequisiteCourse.id} = ${prerequisite.prerequisiteId}
            WHERE ${prerequisite.dependencyId} = ${course.id}
          ),
        ARRAY[]::JSONB[]), NULL)
        `.as("prerequisites"),
      dependencies: sql`
        ARRAY_REMOVE(COALESCE(
          (
            SELECT ARRAY_AGG(
              CASE WHEN ${dependencyCourse.id} IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
                'id', ${dependencyCourse.id},
                'title', ${dependencyCourse.title},
                'department', ${dependencyCourse.department},
                'courseNumber', ${dependencyCourse.courseNumber}
              )
              END
            )
            FROM ${prerequisite} ${dependency}
            LEFT JOIN ${course} ${dependencyCourse} ON ${dependencyCourse.id} = ${dependency.dependencyId}
            WHERE ${dependency.prerequisiteId} = ${course.id}
          ),
        ARRAY[]::JSONB[]), NULL)
        `.as("dependencies"),
      terms: sql<string[]>`
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT
            CASE WHEN ${websocCourse.year} IS NULL THEN NULL
            ELSE CONCAT(${websocCourse.year}, ' ', ${websocCourse.quarter})
            END
          ), NULL)
          `.as("terms"),
      instructors: sql`
        ARRAY_REMOVE(COALESCE(ARRAY_AGG(DISTINCT
          CASE WHEN ${instructor.ucinetid} IS NULL THEN NULL
          ELSE JSONB_BUILD_OBJECT(
            'ucinetid', ${instructor.ucinetid},
            'name', ${instructor.name},
            'title', ${instructor.title},
            'email', ${instructor.email},
            'department', ${instructor.department},
            'shortenedNames', ARRAY(
              SELECT ${instructorToWebsocInstructor.websocInstructorName}
              FROM ${instructorToWebsocInstructor}
              WHERE ${instructorToWebsocInstructor.instructorUcinetid} = ${instructor.ucinetid}
            )
          )
          END
        ), ARRAY[]::JSONB[]), NULL)
        `.as("instructors"),
    })
    .from(course)
    .leftJoin(websocCourse, eq(websocCourse.courseId, course.id))
    .leftJoin(websocSection, eq(websocSection.courseId, websocCourse.id))
    .leftJoin(websocSectionToInstructor, eq(websocSectionToInstructor.sectionId, websocSection.id))
    .leftJoin(websocInstructor, eq(websocInstructor.name, websocSectionToInstructor.instructorName))
    .leftJoin(
      instructorToWebsocInstructor,
      eq(instructorToWebsocInstructor.websocInstructorName, websocInstructor.name),
    )
    .leftJoin(
      instructor,
      and(
        eq(instructor.ucinetid, instructorToWebsocInstructor.instructorUcinetid),
        isNotNull(instructor.ucinetid),
        ne(instructor.ucinetid, "student"),
      ),
    )
    .groupBy(course.id);
});

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
        courseId: course.id,
        instructorUcinetid: instructorToWebsocInstructor.instructorUcinetid,
        terms: sql`
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT
            CASE WHEN ${websocCourse.year} IS NULL THEN NULL
            ELSE CONCAT(${websocCourse.year}, ' ', ${websocCourse.quarter})
            END
          ), NULL)`.as("terms"),
      })
      .from(course)
      .leftJoin(websocCourse, eq(websocCourse.courseId, course.id))
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
      .groupBy(course.id, instructorToWebsocInstructor.instructorUcinetid),
  );
  const coursesCte = qb.$with("courses_cte").as(
    qb
      .with(termsCte)
      .select({
        instructorUcinetid: termsCte.instructorUcinetid,
        courseId: course.id,
        courseInfo: sql`
          CASE WHEN ${course.id} IS NULL
          THEN NULL
          ELSE JSONB_BUILD_OBJECT(
               'id', ${course.id},
               'title', ${course.title},
               'department', ${course.department},
               'courseNumber', ${course.courseNumber},
               'terms', COALESCE(${termsCte.terms}, ARRAY[]::TEXT[])
          )
          END
          `.as("course_info"),
      })
      .from(course)
      .leftJoin(termsCte, eq(termsCte.courseId, course.id))
      .groupBy(course.id, termsCte.instructorUcinetid, termsCte.terms),
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
