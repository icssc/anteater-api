CREATE MATERIALIZED VIEW "public"."course_view" AS (select "course"."id", "course"."updated_at", "course"."department", "course"."department_alias", "course"."course_number", "course"."course_numeric", "course"."school", "course"."title", "course"."course_level", "course"."min_units", "course"."max_units", "course"."description", "course"."department_name", "course"."prerequisite_tree", "course"."prerequisite_text", "course"."repeatability", "course"."grading_option", "course"."concurrent", "course"."same_as", "course"."restriction", "course"."overlap", "course"."corequisites", "course"."is_ge_1a", "course"."is_ge_1b", "course"."is_ge_2", "course"."is_ge_3", "course"."is_ge_4", "course"."is_ge_5a", "course"."is_ge_5b", "course"."is_ge_6", "course"."is_ge_7", "course"."is_ge_8", "course"."ge_text", 
        COALESCE((
          SELECT ARRAY_AGG(JSON_BUILD_OBJECT(
            'id', "prerequisite_course"."id",
            'title', "prerequisite_course"."title",
            'department', "prerequisite_course"."department",
            'courseNumber', "prerequisite_course"."course_number"
          ))
         FROM "prerequisite"
         LEFT JOIN "course" "prerequisite_course" ON "prerequisite_course"."id" = "prerequisite"."prerequisite_id"
         WHERE "prerequisite"."dependency_id" = "course"."id"
         ), ARRAY[]::JSON[])
         as "prerequisites", 
        COALESCE((
          SELECT ARRAY_AGG(JSON_BUILD_OBJECT(
            'id', "dependency_course"."id",
            'title', "dependency_course"."title",
            'department', "dependency_course"."department",
            'courseNumber', "dependency_course"."course_number"
          ))
         FROM "prerequisite" "dependency"
         LEFT JOIN "course" "dependency_course" ON "dependency_course"."id" = "dependency"."dependency_id"
         WHERE "dependency"."prerequisite_id" = "course"."id"
         ), ARRAY[]::JSON[])
         as "dependencies", ARRAY_AGG(DISTINCT CONCAT("websoc_course"."year", ' ', "websoc_course"."quarter")) as "terms", 
        COALESCE(ARRAY_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'ucinetid', "instructor"."ucinetid",
          'name', "instructor"."name",
          'title', "instructor"."title",
          'email', "instructor"."email",
          'department', "instructor"."department",
          'shortenedNames', ARRAY(
            SELECT "instructor_to_websoc_instructor"."websoc_instructor_name"
            FROM "instructor_to_websoc_instructor"
            WHERE "instructor_to_websoc_instructor"."instructor_ucinetid" = "instructor"."ucinetid"
          )
        )), ARRAY[]::JSONB[])
         as "instructors" from "course" left join "websoc_course" on "websoc_course"."course_id" = "course"."id" left join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id" left join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id" left join "websoc_instructor" on "websoc_instructor"."name" = "websoc_section_to_instructor"."instructor_name" left join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_name" = "websoc_instructor"."name" left join "instructor" on "instructor"."ucinetid" = "instructor_to_websoc_instructor"."instructor_ucinetid" where ("instructor"."ucinetid" is null or "instructor"."ucinetid" <> 'student') group by "course"."id");--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."instructor_view" AS (with "shortened_names_cte" as (select "instructor_ucinetid", ARRAY_AGG("websoc_instructor_name") as "shortened_names" from "instructor_to_websoc_instructor" group by "instructor_to_websoc_instructor"."instructor_ucinetid"), "courses_cte" as (with "terms_cte" as (select "course"."id", "instructor_to_websoc_instructor"."instructor_ucinetid", ARRAY_AGG(DISTINCT CONCAT("websoc_course"."year", ' ', "websoc_course"."quarter")) as "terms" from "course" inner join "websoc_course" on "websoc_course"."course_id" = "course"."id" inner join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id" inner join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id" inner join "websoc_instructor" on "websoc_instructor"."name" = "websoc_section_to_instructor"."instructor_name" inner join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_name" = "websoc_instructor"."name" group by "course"."id", "instructor_to_websoc_instructor"."instructor_ucinetid") select "terms_cte"."instructor_ucinetid", "course"."id", 
          CASE WHEN "course"."id" IS NULL
          THEN NULL
          ELSE JSONB_BUILD_OBJECT(
               'id', "course"."id",
               'title', "course"."title",
               'department', "course"."department",
               'courseNumber', "course"."course_number",
               'terms', COALESCE("terms", ARRAY[]::TEXT[])
          )
          END
           as "course_info" from "course" inner join "terms_cte" on "terms_cte"."id" = "course"."id" group by "course"."id", "terms_cte"."instructor_ucinetid", "terms") select "instructor"."ucinetid", "instructor"."name", "instructor"."title", "instructor"."email", "instructor"."department", COALESCE("shortened_names", ARRAY[]::TEXT[]) as "shortened_names", 
          ARRAY_AGG(DISTINCT "course_info")
         as "courses" from "instructor" inner join "shortened_names_cte" on "shortened_names_cte"."instructor_ucinetid" = "instructor"."ucinetid" inner join "courses_cte" on "courses_cte"."instructor_ucinetid" = "instructor"."ucinetid" where "instructor"."ucinetid" <> 'student' group by "instructor"."ucinetid", "shortened_names");