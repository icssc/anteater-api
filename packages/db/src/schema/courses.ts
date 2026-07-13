import { aliasedTable, and, eq, getTableColumns, isNotNull, ne, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  json,
  pgMaterializedView,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  courseLevel,
  instructor,
  instructorToWebsocInstructor,
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from ".";

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
