import { eq, getTableColumns, ne, sql } from "drizzle-orm";
import { pgMaterializedView } from "drizzle-orm/pg-core";
import { course, instructor, instructorToWebsocInstructor } from "./index.ts";
import {
  websocCourse,
  websocInstructor,
  websocSection,
  websocSectionToInstructor,
} from "./websoc.ts";

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
