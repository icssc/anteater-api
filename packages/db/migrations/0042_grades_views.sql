CREATE MATERIALIZED VIEW "public"."grades_by_course_instructor_view" AS
(
select "websoc_course"."dept_code",
       "websoc_course"."course_number",
       "websoc_section_to_instructor"."instructor_name",
       avg("websoc_section_grade"."average_gpa")    as "average_gpa",
       sum("websoc_section_grade"."grade_a_count")  as "grade_a_count",
       sum("websoc_section_grade"."grade_b_count")  as "grade_b_count",
       sum("websoc_section_grade"."grade_c_count")  as "grade_c_count",
       sum("websoc_section_grade"."grade_d_count")  as "grade_d_count",
       sum("websoc_section_grade"."grade_f_count")  as "grade_f_count",
       sum("websoc_section_grade"."grade_p_count")  as "grade_p_count",
       sum("websoc_section_grade"."grade_np_count") as "grade_np_count",
       sum("websoc_section_grade"."grade_w_count")  as "grade_w_count"
from "websoc_section_grade"
         inner join "websoc_section" on "websoc_section"."id" = "websoc_section_grade"."section_id"
         inner join "websoc_course" on "websoc_course"."id" = "websoc_section"."course_id"
         inner join "websoc_section_to_instructor"
                    on "websoc_section_to_instructor"."section_id" = "websoc_section"."id"
group by "websoc_course"."dept_code", "websoc_course"."course_number",
         "websoc_section_to_instructor"."instructor_name");--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."grades_by_course_view" AS
(
select "websoc_course"."dept_code",
       "websoc_course"."course_number",
       avg("websoc_section_grade"."average_gpa")    as "average_gpa",
       sum("websoc_section_grade"."grade_a_count")  as "grade_a_count",
       sum("websoc_section_grade"."grade_b_count")  as "grade_b_count",
       sum("websoc_section_grade"."grade_c_count")  as "grade_c_count",
       sum("websoc_section_grade"."grade_d_count")  as "grade_d_count",
       sum("websoc_section_grade"."grade_f_count")  as "grade_f_count",
       sum("websoc_section_grade"."grade_p_count")  as "grade_p_count",
       sum("websoc_section_grade"."grade_np_count") as "grade_np_count",
       sum("websoc_section_grade"."grade_w_count")  as "grade_w_count"
from "websoc_section_grade"
         inner join "websoc_section" on "websoc_section"."id" = "websoc_section_grade"."section_id"
         inner join "websoc_course" on "websoc_course"."id" = "websoc_section"."course_id"
group by "websoc_course"."dept_code", "websoc_course"."course_number");
-- manual steps
CREATE UNIQUE INDEX "grades_by_course_instructor_view_idx" ON "public"."grades_by_course_instructor_view" ("dept_code", "course_number", "instructor_name");
CREATE UNIQUE INDEX "grades_by_course_view_idx"
    ON "public"."grades_by_course_view" ("dept_code", "course_number");
