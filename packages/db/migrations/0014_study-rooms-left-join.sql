DROP MATERIALIZED VIEW "public"."study_room_view";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."study_room_view" AS (select "study_room"."id", "study_room"."name", "study_room"."capacity", "study_room"."location", "study_room"."description", "study_room"."directions", "study_room"."tech_enhanced", ARRAY_REMOVE(COALESCE(ARRAY_AGG(CASE WHEN "study_room_slot"."study_room_id" IS NULL THEN NULL
        ELSE JSONB_BUILD_OBJECT(
          'studyRoomId', "study_room_slot"."study_room_id",
          'start', to_json("study_room_slot"."start" AT TIME ZONE 'America/Los_Angeles'),
          'end', to_json("study_room_slot"."end" AT TIME ZONE 'America/Los_Angeles'),
          'isAvailable', "study_room_slot"."is_available"
        )
        END), ARRAY[]::JSONB[]), NULL) as "slots" from "study_room" left join "study_room_slot" on "study_room"."id" = "study_room_slot"."study_room_id" group by "study_room"."id");