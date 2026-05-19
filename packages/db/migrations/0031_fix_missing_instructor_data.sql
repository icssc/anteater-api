DROP MATERIALIZED VIEW "public"."course_view";--> statement-breakpoint
DROP MATERIALIZED VIEW "public"."instructor_view";--> statement-breakpoint
ALTER TABLE "instructor_to_websoc_instructor" DROP CONSTRAINT "instructor_to_websoc_instructor_websoc_instructor_name_websoc_instructor_name_fk";
--> statement-breakpoint
ALTER TABLE "websoc_section_to_instructor" DROP CONSTRAINT "websoc_section_to_instructor_instructor_name_websoc_instructor_name_fk";
--> statement-breakpoint
DROP INDEX "instructor_to_websoc_instructor_websoc_instructor_name_index";--> statement-breakpoint
DROP INDEX "instructor_to_websoc_instructor_instructor_ucinetid_websoc_instructor_name_index";--> statement-breakpoint
DROP INDEX "websoc_section_to_instructor_instructor_name_index";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'websoc_instructor'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "websoc_instructor" DROP CONSTRAINT "websoc_instructor_pkey" CASCADE;--> statement-breakpoint
ALTER TABLE "instructor_to_websoc_instructor" ADD COLUMN "websoc_instructor_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_instructor" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_instructor" ADD COLUMN "school" varchar;--> statement-breakpoint
ALTER TABLE "websoc_instructor" ADD COLUMN "department" varchar;--> statement-breakpoint
ALTER TABLE "websoc_section_to_instructor" ADD COLUMN "instructor_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "instructor_to_websoc_instructor" ADD CONSTRAINT "instructor_to_websoc_instructor_websoc_instructor_id_websoc_instructor_id_fk" FOREIGN KEY ("websoc_instructor_id") REFERENCES "public"."websoc_instructor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websoc_section_to_instructor" ADD CONSTRAINT "websoc_section_to_instructor_instructor_id_websoc_instructor_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."websoc_instructor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instructor_to_websoc_instructor_websoc_instructor_id_index" ON "instructor_to_websoc_instructor" USING btree ("websoc_instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instructor_to_websoc_instructor_instructor_ucinetid_websoc_instructor_id_index" ON "instructor_to_websoc_instructor" USING btree ("instructor_ucinetid","websoc_instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "websoc_instructor_name_school_index" ON "websoc_instructor" USING btree ("name","school");--> statement-breakpoint
CREATE INDEX "websoc_section_to_instructor_instructor_id_index" ON "websoc_section_to_instructor" USING btree ("instructor_id");--> statement-breakpoint
ALTER TABLE "instructor_to_websoc_instructor" DROP COLUMN "websoc_instructor_name";--> statement-breakpoint
ALTER TABLE "websoc_section_to_instructor" DROP COLUMN "instructor_name";--> statement-breakpoint
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
              SELECT "instructor_to_websoc_instructor"."websoc_instructor_id"
              FROM "instructor_to_websoc_instructor"
              WHERE "instructor_to_websoc_instructor"."instructor_ucinetid" = "instructor"."ucinetid"
            )
          )
          END
        ), ARRAY[]::JSONB[]), NULL)
         as "instructors" from "course" left join "websoc_course" on "websoc_course"."course_id" = "course"."id" left join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id" left join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id" left join "websoc_instructor" on "websoc_instructor"."id" = "websoc_section_to_instructor"."instructor_id" left join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_id" = "websoc_instructor"."id" left join "instructor" on ("instructor"."ucinetid" = "instructor_to_websoc_instructor"."instructor_ucinetid" and "instructor"."ucinetid" is not null and "instructor"."ucinetid" <> 'student') group by "course"."id");--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."instructor_view" AS (with "shortened_names_cte" as (select "instructor_to_websoc_instructor"."instructor_ucinetid", ARRAY_AGG("websoc_instructor"."name") as "shortened_names" from "instructor_to_websoc_instructor" inner join "websoc_instructor" on "websoc_instructor"."id" = "instructor_to_websoc_instructor"."websoc_instructor_id" group by "instructor_to_websoc_instructor"."instructor_ucinetid"), "courses_cte" as (with "terms_cte" as (select "course"."id", "instructor_to_websoc_instructor"."instructor_ucinetid", 
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT
            CASE WHEN "websoc_course"."year" IS NULL THEN NULL
            ELSE CONCAT("websoc_course"."year", ' ', "websoc_course"."quarter")
            END
          ), NULL) as "terms" from "course" left join "websoc_course" on "websoc_course"."course_id" = "course"."id" left join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id" left join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id" left join "websoc_instructor" on "websoc_instructor"."id" = "websoc_section_to_instructor"."instructor_id" left join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_id" = "websoc_instructor"."id" group by "course"."id", "instructor_to_websoc_instructor"."instructor_ucinetid") select "terms_cte"."instructor_ucinetid", "course"."id", 
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
           as "course_info" from "course" left join "terms_cte" on "terms_cte"."id" = "course"."id" group by "course"."id", "terms_cte"."instructor_ucinetid", "terms") select "instructor"."ucinetid", "instructor"."name", "instructor"."title", "instructor"."email", "instructor"."department", COALESCE("shortened_names", ARRAY[]::TEXT[]) as "shortened_names", 
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT "course_info"), NULL)
         as "courses" from "instructor" left join "shortened_names_cte" on "shortened_names_cte"."instructor_ucinetid" = "instructor"."ucinetid" left join "courses_cte" on "courses_cte"."instructor_ucinetid" = "instructor"."ucinetid" where "instructor"."ucinetid" <> 'student' group by "instructor"."ucinetid", "shortened_names");