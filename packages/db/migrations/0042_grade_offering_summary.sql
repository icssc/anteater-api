CREATE MATERIALIZED VIEW "public"."grade_offering_summary" AS
SELECT
  "websoc_course"."dept_code",
  "websoc_course"."course_number",
  "websoc_section_to_instructor"."instructor_name",
  avg("websoc_section_grade"."average_gpa") AS "average_gpa",
  sum("websoc_section_grade"."grade_a_count") AS "grade_a_count",
  sum("websoc_section_grade"."grade_b_count") AS "grade_b_count",
  sum("websoc_section_grade"."grade_c_count") AS "grade_c_count",
  sum("websoc_section_grade"."grade_d_count") AS "grade_d_count",
  sum("websoc_section_grade"."grade_f_count") AS "grade_f_count",
  sum("websoc_section_grade"."grade_p_count") AS "grade_p_count",
  sum("websoc_section_grade"."grade_np_count") AS "grade_np_count",
  sum("websoc_section_grade"."grade_w_count") AS "grade_w_count"
FROM "websoc_section_grade"
JOIN "websoc_section" ON "websoc_section"."id" = "websoc_section_grade"."section_id"
JOIN "websoc_course" ON "websoc_course"."id" = "websoc_section"."course_id"
JOIN "websoc_section_to_instructor" ON "websoc_section_to_instructor"."section_id" = "websoc_section"."id"
GROUP BY "websoc_course"."dept_code", "websoc_course"."course_number", "websoc_section_to_instructor"."instructor_name";
--> statement-breakpoint
CREATE UNIQUE INDEX "grade_offering_summary_offering_idx"
ON "public"."grade_offering_summary" ("dept_code", "course_number", "instructor_name");
--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."grade_course_summary" AS
SELECT
  "websoc_course"."dept_code",
  "websoc_course"."course_number",
  avg("websoc_section_grade"."average_gpa") AS "average_gpa",
  sum("websoc_section_grade"."grade_a_count") AS "grade_a_count",
  sum("websoc_section_grade"."grade_b_count") AS "grade_b_count",
  sum("websoc_section_grade"."grade_c_count") AS "grade_c_count",
  sum("websoc_section_grade"."grade_d_count") AS "grade_d_count",
  sum("websoc_section_grade"."grade_f_count") AS "grade_f_count",
  sum("websoc_section_grade"."grade_p_count") AS "grade_p_count",
  sum("websoc_section_grade"."grade_np_count") AS "grade_np_count",
  sum("websoc_section_grade"."grade_w_count") AS "grade_w_count"
FROM "websoc_section_grade"
JOIN "websoc_section" ON "websoc_section"."id" = "websoc_section_grade"."section_id"
JOIN "websoc_course" ON "websoc_course"."id" = "websoc_section"."course_id"
GROUP BY "websoc_course"."dept_code", "websoc_course"."course_number";
--> statement-breakpoint
CREATE UNIQUE INDEX "grade_course_summary_course_idx"
ON "public"."grade_course_summary" ("dept_code", "course_number");
