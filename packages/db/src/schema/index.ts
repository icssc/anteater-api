import type { SQL } from "drizzle-orm";
import { and, eq, getTableColumns, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  primaryKey,
  real,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { aliasedTable } from "../drizzle.ts";
import {
  courseLevel,
  term,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "./websoc.ts";

export * from "./degreeworks.ts";
export * from "./websoc.ts";

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

export type APCoursesGrantedTree =
  | {
      AND: (APCoursesGrantedTree | string)[];
    }
  | {
      OR: (APCoursesGrantedTree | string)[];
    };

// Sample Programs Enum
export const StandingYear = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
export type StandingYearType = (typeof StandingYear)[number];

// Course Validation Entry Types
export type CourseEntry = { type: "courseId"; value: string } | { type: "unknown"; value: string };

// Sample Program Types
export type SampleProgramEntry = {
  year: StandingYearType;
  fall: CourseEntry[];
  winter: CourseEntry[];
  spring: CourseEntry[];
};

// Sample Programs Tables
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

// Misc. enums

export const materialTerms = ["Fall", "Winter", "Spring", "Summer"] as const;

export const textbookFormats = ["Physical", "Electronic", "Both", "OER"] as const;
export const textbookFormat = pgEnum("textbook_format", textbookFormats);
export type TextbookFormat = (typeof textbookFormats)[number];

export const materialRequirements = ["Required", "Recommended", "GoToClassFirst"] as const;
export const materialRequirement = pgEnum("material_requirement", materialRequirements);
export type MaterialRequirement = (typeof materialRequirements)[number];

// WebSoc enums

// Primary WebSoc tables

// WebSoc-adjacent data tables

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
    repeatabilityTimes: integer("repeatability_times"),
    repeatabilityType: varchar("repeatability_type"),
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

export const courseMaterial = pgTable(
  "course_material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    isbn: varchar("isbn"),
    author: varchar("author"),
    title: varchar("title").notNull(),
    edition: varchar("edition"),
    format: textbookFormat("format").notNull(),
    requirement: materialRequirement("requirement"),
    mmsId: varchar("mms_id"),
    link: text("link"),
  },
  (table) => [index().on(table.sectionId)],
);

// dining stuff
export const diningRestaurant = pgTable("dining_restaurant", {
  id: varchar("id").primaryKey(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningPeriod = pgTable(
  "dining_period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealPeriodTypeId: integer("meal_period_type_id")
      .notNull()
      .references(() => diningMealPeriodType.adobeId),
    date: date("date").notNull(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex().on(table.mealPeriodTypeId, table.date, table.restaurantId),
    index().on(table.date),
    index().on(table.restaurantId),
  ],
);

export const diningStation = pgTable(
  "dining_station",
  {
    id: varchar("id").primaryKey(),
    name: varchar("name").notNull(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.restaurantId)],
);

export const diningDish = pgTable(
  "dining_dish",
  {
    id: varchar("id").primaryKey(),
    stationId: varchar("station_id")
      .notNull()
      .references(() => diningStation.id, {
        onDelete: "cascade",
      }),
    name: varchar("name").notNull(),
    description: varchar("description").notNull(),
    ingredients: varchar("ingredients"),
    category: varchar("category").notNull(),
    imageUrl: varchar("image_url"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.stationId)],
);

export const diningNutritionInfo = pgTable("dining_nutrition_info", {
  dishId: varchar("dish_id")
    .primaryKey()
    .references(() => diningDish.id, {
      onDelete: "cascade",
    }),
  servingSize: varchar("serving_size"),
  servingUnit: varchar("serving_unit"),
  calories: numeric("calories", { precision: 10, scale: 2 }),
  totalFatG: numeric("total_fat_g", { precision: 10, scale: 2 }),
  transFatG: numeric("trans_fat_g", { precision: 10, scale: 2 }),
  saturatedFatG: numeric("saturated_fat_g", { precision: 10, scale: 2 }),
  cholesterolMg: numeric("cholesterol_mg", { precision: 10, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { precision: 10, scale: 2 }),
  totalCarbsG: numeric("total_carbs_g", { precision: 10, scale: 2 }),
  dietaryFiberG: numeric("dietary_fiber_g", { precision: 10, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 10, scale: 2 }),
  proteinG: numeric("protein_g", { precision: 10, scale: 2 }),
  calciumMg: numeric("calcium", { precision: 10, scale: 2 }),
  ironMg: numeric("iron", { precision: 10, scale: 2 }),
  vitaminAIU: numeric("vitamin_a", { precision: 10, scale: 2 }),
  vitaminCIU: numeric("vitamin_c", { precision: 10, scale: 2 }),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningDietRestriction = pgTable("dining_diet_restriction", {
  dishId: varchar("dish_id")
    .primaryKey()
    .references(() => diningDish.id, {
      onDelete: "cascade",
    }),
  containsEggs: boolean("contains_eggs").notNull(),
  containsFish: boolean("contains_fish").notNull(),
  containsMilk: boolean("contains_milk").notNull(),
  containsPeanuts: boolean("contains_peanuts").notNull(),
  containsSesame: boolean("contains_sesame").notNull(),
  containsShellfish: boolean("contains_shellfish").notNull(),
  containsSoy: boolean("contains_soy").notNull(),
  containsTreeNuts: boolean("contains_tree_nuts").notNull(),
  containsWheat: boolean("contains_wheat").notNull(),
  isGlutenFree: boolean("is_gluten_free").notNull(),
  isHalal: boolean("is_halal").notNull(),
  isKosher: boolean("is_kosher").notNull(),
  isLocallyGrown: boolean("is_locally_grown").notNull(),
  isOrganic: boolean("is_organic").notNull(),
  isVegan: boolean("is_vegan").notNull(),
  isVegetarian: boolean("is_vegetarian").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningDishToPeriod = pgTable(
  "dining_dish_to_period",
  {
    periodId: uuid("period_id")
      .notNull()
      .references(() => diningPeriod.id),
    dishId: varchar("dish_id")
      .notNull()
      .references(() => diningDish.id),
  },
  (table) => [
    {
      pk: primaryKey({
        name: "dining_dish_to_period_pk",
        columns: [table.periodId, table.dishId],
      }),
    },
  ],
);

export const diningEvent = pgTable(
  "dining_event",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: varchar("title").notNull(),
    image: varchar("image"),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    description: varchar("description"),
    start: timestamp("start"),
    end: timestamp("end"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    // Drizzle does not support `nullsNotDistinct` on a `uniqueIndex`, but `uniqueIndex` is required to implement a partial index. The comment below is implemented in migrations/0034_dining_event_null_start.sql
    // uniqueIndex().on(table.restaurantId, table.start, table.end).nullsNotDistinct().where(isNotNull(table.start)),
    uniqueIndex().on(table.restaurantId, table.title).where(isNull(table.start)),
  ],
);

export const diningMealPeriodType = pgTable("dining_meal_period_type", {
  adobeId: integer("adobe_id").primaryKey(),
  name: varchar("name").notNull(),
  position: integer("position").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningSchedule = pgTable(
  "dining_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    upstreamId: varchar("upstream_id").notNull(),
    name: varchar("name").notNull(),
    type: varchar("type").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique().on(table.restaurantId, table.name, table.startDate, table.endDate).nullsNotDistinct(), // forbid multiple Standard schedules with null start/end dates
    index().on(table.restaurantId),
  ],
);

export const diningScheduleMealPeriod = pgTable(
  "dining_schedule_meal_period",
  {
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => diningSchedule.id, {
        onDelete: "cascade",
      }),
    mealPeriodTypeId: integer("meal_period_type_id")
      .notNull()
      .references(() => diningMealPeriodType.adobeId),
    sunOpen: time("sun_open"),
    sunClose: time("sun_close"),
    monOpen: time("mon_open"),
    monClose: time("mon_close"),
    tueOpen: time("tue_open"),
    tueClose: time("tue_close"),
    wedOpen: time("wed_open"),
    wedClose: time("wed_close"),
    thuOpen: time("thu_open"),
    thuClose: time("thu_close"),
    friOpen: time("fri_open"),
    friClose: time("fri_close"),
    satOpen: time("sat_open"),
    satClose: time("sat_close"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "dining_schedule_meal_period_pk",
      columns: [table.scheduleId, table.mealPeriodTypeId],
    }),
  ],
);

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
