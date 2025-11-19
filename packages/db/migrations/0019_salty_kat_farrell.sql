ALTER TABLE "websoc_section_meeting_to_location" DROP CONSTRAINT "websoc_section_meeting_to_location_section_id_websoc_section_meeting_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_meeting_to_location_section_id_index";--> statement-breakpoint
DROP INDEX IF EXISTS "websoc_section_meeting_to_location_section_id_location_id_index";--> statement-breakpoint
ALTER TABLE "websoc_section_meeting_to_location" ADD COLUMN "meeting_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "websoc_section_meeting_to_location" ADD CONSTRAINT "websoc_section_meeting_to_location_meeting_id_websoc_section_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."websoc_section_meeting"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_meeting_to_location_meeting_id_index" ON "websoc_section_meeting_to_location" USING btree ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_section_meeting_to_location_meeting_id_location_id_index" ON "websoc_section_meeting_to_location" USING btree ("meeting_id","location_id");--> statement-breakpoint
ALTER TABLE "websoc_section_meeting_to_location" DROP COLUMN IF EXISTS "section_id";