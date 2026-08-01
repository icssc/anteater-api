ALTER TABLE "tentative_course_offering" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tentative_course_offering" ADD COLUMN "source_url" varchar;--> statement-breakpoint
UPDATE "tentative_course_offering"
SET "source_url" = 'https://courselisting.ics.uci.edu/'
WHERE "source" = 'ICS_COURSE_OFFERINGS';--> statement-breakpoint
ALTER TABLE "tentative_course_offering" ALTER COLUMN "source_url" SET NOT NULL;
