DROP INDEX IF EXISTS "instructor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_instructor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "instructor_to_websoc_instructor_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "larc_section_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "degree_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dependency_dept_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prereq_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "depend_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prerequisite_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "major_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "study_location_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "study_room_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dept_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_course_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_1a_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_1b_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_2_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_3_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_4_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_5a_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_5b_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_6_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_7_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ge_8_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dept_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "course_query_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "school_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_department_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_location_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_school_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "course_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "meeting_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_enrollment_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "grade_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "meeting_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "location_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_meeting_to_location_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_to_instructor_section_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_to_instructor_instructor_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructor_to_websoc_instructor_instructor_ucinetid_index" ON "instructor_to_websoc_instructor" USING btree ("instructor_ucinetid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructor_to_websoc_instructor_websoc_instructor_name_index" ON "instructor_to_websoc_instructor" USING btree ("websoc_instructor_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instructor_to_websoc_instructor_instructor_ucinetid_websoc_instructor_name_index" ON "instructor_to_websoc_instructor" USING btree ("instructor_ucinetid","websoc_instructor_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "larc_section_course_id_index" ON "larc_section" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "major_degree_id_index" ON "major" USING btree ("degree_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prerequisite_dep_dept_index" ON "prerequisite" USING btree ("dep_dept");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prerequisite_prerequisite_id_index" ON "prerequisite" USING btree ("prerequisite_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prerequisite_dependency_id_index" ON "prerequisite" USING btree ("dependency_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prerequisite_prerequisite_id_dependency_id_index" ON "prerequisite" USING btree ("prerequisite_id","dependency_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialization_major_id_index" ON "specialization" USING btree ("major_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_room_study_location_id_index" ON "study_room" USING btree ("study_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_room_slot_study_room_id_index" ON "study_room_slot" USING btree ("study_room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_department_id_index" ON "websoc_course" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_course_id_index" ON "websoc_course" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_course_year_quarter_school_name_dept_code_course_number_course_title_index" ON "websoc_course" USING btree ("year","quarter","school_name","dept_code","course_number","course_title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_1a_index" ON "websoc_course" USING btree ("year","quarter","is_ge_1a");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_1b_index" ON "websoc_course" USING btree ("year","quarter","is_ge_1b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_2_index" ON "websoc_course" USING btree ("year","quarter","is_ge_2");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_3_index" ON "websoc_course" USING btree ("year","quarter","is_ge_3");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_4_index" ON "websoc_course" USING btree ("year","quarter","is_ge_4");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_5a_index" ON "websoc_course" USING btree ("year","quarter","is_ge_5a");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_5b_index" ON "websoc_course" USING btree ("year","quarter","is_ge_5b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_6_index" ON "websoc_course" USING btree ("year","quarter","is_ge_6");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_7_index" ON "websoc_course" USING btree ("year","quarter","is_ge_7");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_is_ge_8_index" ON "websoc_course" USING btree ("year","quarter","is_ge_8");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_dept_code_index" ON "websoc_course" USING btree ("year","quarter","dept_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_course_year_quarter_dept_code_course_number_index" ON "websoc_course" USING btree ("year","quarter","dept_code","course_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_department_school_id_index" ON "websoc_department" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_department_year_quarter_school_id_dept_code_index" ON "websoc_department" USING btree ("year","quarter","school_id","dept_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_location_building_room_index" ON "websoc_location" USING btree ("building","room");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_school_year_quarter_school_name_index" ON "websoc_school" USING btree ("year","quarter","school_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_course_id_index" ON "websoc_section" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_section_year_quarter_section_code_index" ON "websoc_section" USING btree ("year","quarter","section_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_enrollment_section_id_index" ON "websoc_section_enrollment" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_section_enrollment_section_id_created_at_index" ON "websoc_section_enrollment" USING btree ("section_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_grade_section_id_index" ON "websoc_section_grade" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_meeting_section_id_index" ON "websoc_section_meeting" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_meeting_to_location_section_id_index" ON "websoc_section_meeting_to_location" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_meeting_to_location_location_id_index" ON "websoc_section_meeting_to_location" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_section_meeting_to_location_section_id_location_id_index" ON "websoc_section_meeting_to_location" USING btree ("section_id","location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_to_instructor_section_id_index" ON "websoc_section_to_instructor" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_to_instructor_instructor_name_index" ON "websoc_section_to_instructor" USING btree ("instructor_name");--> statement-breakpoint
DROP TYPE "public"."final_exam_status";