import { and, eq, getTableColumns, isNotNull, ne, sql } from "drizzle-orm";
import { pgMaterializedView } from "drizzle-orm/pg-core";
import { aliasedTable } from "../drizzle.ts";
import { course, instructor, instructorToWebsocInstructor, prerequisite } from "./index.ts";
import {
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "./websoc.ts";

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
