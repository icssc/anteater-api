DROP MATERIALIZED VIEW "public"."instructor_view";
--> statement-breakpoint
ALTER TABLE "websoc_instructor"
ADD COLUMN "identifier" varchar;
--> statement-breakpoint
ALTER TABLE "websoc_instructor"
ADD COLUMN "school" varchar;
--> statement-breakpoint
ALTER TABLE "websoc_instructor"
ADD COLUMN "department" varchar;
--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."instructor_view" AS (
  with "shortened_names_cte" as (
    select "instructor_ucinetid",
      ARRAY_AGG(
        DISTINCT split_part(
          "websoc_instructor_name",
          '&|*',
          1
        )
      ) as "shortened_names"
    from "instructor_to_websoc_instructor"
    group by "instructor_to_websoc_instructor"."instructor_ucinetid"
  ),
  "courses_cte" as (
    with "terms_cte" as (
      select "course"."id",
        "instructor_to_websoc_instructor"."instructor_ucinetid",
        ARRAY_REMOVE(
          ARRAY_AGG(
            DISTINCT CASE
              WHEN "websoc_course"."year" IS NULL THEN NULL
              ELSE CONCAT(
                "websoc_course"."year",
                ' ',
                "websoc_course"."quarter"
              )
            END
          ),
          NULL
        ) as "terms"
      from "course"
        left join "websoc_course" on "websoc_course"."course_id" = "course"."id"
        left join "websoc_section" on "websoc_section"."course_id" = "websoc_course"."id"
        left join "websoc_section_to_instructor" on "websoc_section_to_instructor"."section_id" = "websoc_section"."id"
        left join "websoc_instructor" on "websoc_instructor"."name" = "websoc_section_to_instructor"."instructor_name"
        left join "instructor_to_websoc_instructor" on "instructor_to_websoc_instructor"."websoc_instructor_name" = "websoc_instructor"."name"
      group by "course"."id",
        "instructor_to_websoc_instructor"."instructor_ucinetid"
    )
    select "terms_cte"."instructor_ucinetid",
      "course"."id",
      CASE
        WHEN "course"."id" IS NULL THEN NULL
        ELSE JSONB_BUILD_OBJECT(
          'id',
          "course"."id",
          'title',
          "course"."title",
          'department',
          "course"."department",
          'courseNumber',
          "course"."course_number",
          'terms',
          COALESCE("terms", ARRAY []::TEXT [])
        )
      END as "course_info"
    from "course"
      left join "terms_cte" on "terms_cte"."id" = "course"."id"
    group by "course"."id",
      "terms_cte"."instructor_ucinetid",
      "terms"
  )
  select "instructor"."ucinetid",
    "instructor"."name",
    "instructor"."title",
    "instructor"."email",
    "instructor"."department",
    COALESCE("shortened_names", ARRAY []::TEXT []) as "shortened_names",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "course_info"), NULL) as "courses"
  from "instructor"
    left join "shortened_names_cte" on "shortened_names_cte"."instructor_ucinetid" = "instructor"."ucinetid"
    left join "courses_cte" on "courses_cte"."instructor_ucinetid" = "instructor"."ucinetid"
  where "instructor"."ucinetid" <> 'student'
  group by "instructor"."ucinetid",
    "shortened_names"
);