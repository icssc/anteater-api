DROP MATERIALIZED VIEW "public"."course_view";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."course_view" AS (select "course"."id", "course"."updated_at", "course"."department", "course"."shortened_dept", "course"."department_alias", "course"."course_number", "course"."course_numeric", "course"."school", "course"."title", "course"."course_level", "course"."min_units", "course"."max_units", "course"."description", "course"."department_name", "course"."prerequisite_tree", "course"."prerequisite_text", "course"."repeatability", "course"."grading_option", "course"."concurrent", "course"."same_as", "course"."restriction", "course"."overlap", "course"."corequisites", "course"."is_ge_1a", "course"."is_ge_1b", "course"."is_ge_2", "course"."is_ge_3", "course"."is_ge_4", "course"."is_ge_5a", "course"."is_ge_5b", "course"."is_ge_6", "course"."is_ge_7", "course"."is_ge_8", "course"."ge_text", 
        ARRAY_REMOVE(COALESCE(
          (
            SELECT ARRAY_AGG(
              CASE WHEN "prerequisite_course"."id" IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
              'id', "prerequisite_course"."id",
              'title', "prerequisite_course"."title",
              'department', "prerequisite_course"."department",
              'courseNumber', "prerequisite_course"."course_number"
              )
              END
            )
            FROM "prerequisite"
            LEFT JOIN "course" "prerequisite_course" ON "prerequisite_course"."id" = "prerequisite"."prerequisite_id"
            WHERE "prerequisite"."dependency_id" = "course"."id"
          ),
        ARRAY[]::JSONB[]), NULL)
         as "prerequisites", 
        ARRAY_REMOVE(COALESCE(
          (
            SELECT ARRAY_AGG(
              CASE WHEN "dependency_course"."id" IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
                'id', "dependency_course"."id",
                'title', "dependency_course"."title",
                'department', "dependency_course"."department",
                'courseNumber', "dependency_course"."course_number"
              )
              END
            )
            FROM "prerequisite" "dependency"
            LEFT JOIN "course" "dependency_course" ON "dependency_course"."id" = "dependency"."dependency_id"
            WHERE "dependency"."prerequisite_id" = "course"."id"
          ),
        ARRAY[]::JSONB[]), NULL)
         as "dependencies", 
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT
            CASE WHEN "websoc_course"."year" IS NULL THEN NULL
            ELSE CONCAT("websoc_course"."year", ' ', "websoc_course"."quarter")
            END
          ), NULL)
           as "terms", 
        ARRAY_REMOVE(COALESCE(ARRAY_AGG(DISTINCT
          CASE WHEN "instructor"."ucinetid" IS NULL THEN NULL
          ELSE JSONB_BUILD_OBJECT(
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
          )
          END
        ), ARRAY[]::JSONB[]), NULL)
         as "instructors", 
        ARRAY_REMOVE(COALESCE(
          (
            SELECT ARRAY_AGG("alternate_course"."id")
            FROM "course" "alternate_course"
            WHERE
              REPLACE("alternate_course"."description", ' ', '') = REPLACE("course"."description", ' ', '')
              AND "alternate_course"."id" != "course"."id"
          ),
        ARRAY[]::TEXT[]), NULL) as "aliases" from "course" left join "websoc_course" on "websoc_course"."course_id" = "course"."id" left join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id" left join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id" left join "websoc_instructor" on "websoc_instructor"."name" = "websoc_section_to_instructor"."instructor_name" left join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_name" = "websoc_instructor"."name" left join "instructor" on ("instructor"."ucinetid" = "instructor_to_websoc_instructor"."instructor_ucinetid" and "instructor"."ucinetid" is not null and "instructor"."ucinetid" <> 'student') group by "course"."id");