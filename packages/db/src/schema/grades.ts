import { avg, eq, sum } from "drizzle-orm";
import { pgMaterializedView } from "drizzle-orm/pg-core";
import {
  websocCourse,
  websocSection,
  websocSectionGrade,
  websocSectionToInstructor,
} from "./websoc.ts";

const gradeTotals = {
  averageGPA: avg(websocSectionGrade.averageGPA)
    .mapWith((value): number | null => Number(value))
    .as("average_gpa"),
  gradeACount: sum(websocSectionGrade.gradeACount).mapWith(Number).as("grade_a_count"),
  gradeBCount: sum(websocSectionGrade.gradeBCount).mapWith(Number).as("grade_b_count"),
  gradeCCount: sum(websocSectionGrade.gradeCCount).mapWith(Number).as("grade_c_count"),
  gradeDCount: sum(websocSectionGrade.gradeDCount).mapWith(Number).as("grade_d_count"),
  gradeFCount: sum(websocSectionGrade.gradeFCount).mapWith(Number).as("grade_f_count"),
  gradePCount: sum(websocSectionGrade.gradePCount).mapWith(Number).as("grade_p_count"),
  gradeNPCount: sum(websocSectionGrade.gradeNPCount).mapWith(Number).as("grade_np_count"),
  gradeWCount: sum(websocSectionGrade.gradeWCount).mapWith(Number).as("grade_w_count"),
};

export const gradeOfferingSummary = pgMaterializedView("grade_offering_summary").as((qb) =>
  qb
    .select({
      deptCode: websocCourse.deptCode,
      courseNumber: websocCourse.courseNumber,
      instructorName: websocSectionToInstructor.instructorName,
      ...gradeTotals,
    })
    .from(websocSectionGrade)
    .innerJoin(websocSection, eq(websocSection.id, websocSectionGrade.sectionId))
    .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
    .innerJoin(websocSectionToInstructor, eq(websocSectionToInstructor.sectionId, websocSection.id))
    .groupBy(
      websocCourse.deptCode,
      websocCourse.courseNumber,
      websocSectionToInstructor.instructorName,
    ),
);

export const gradeCourseSummary = pgMaterializedView("grade_course_summary").as((qb) =>
  qb
    .select({
      deptCode: websocCourse.deptCode,
      courseNumber: websocCourse.courseNumber,
      ...gradeTotals,
    })
    .from(websocSectionGrade)
    .innerJoin(websocSection, eq(websocSection.id, websocSectionGrade.sectionId))
    .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
    .groupBy(websocCourse.deptCode, websocCourse.courseNumber),
);
