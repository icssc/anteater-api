ALTER TABLE "course" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_course" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_department" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_instructor" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_location" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_school" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_section" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "websoc_meta" ADD COLUMN "last_dept_scraped" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_room_slot_study_room_id_start_end_index" ON "study_room_slot" USING btree ("study_room_id","start","end");