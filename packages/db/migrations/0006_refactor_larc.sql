ALTER TABLE "larc_section" RENAME COLUMN "days" TO "days_string";--> statement-breakpoint
ALTER TABLE "larc_section" RENAME COLUMN "time" TO "time_string";--> statement-breakpoint
ALTER TABLE "larc_section" RENAME COLUMN "bldg" TO "building";--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_monday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_monday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_tuesday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_tuesday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_wednesday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_wednesday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_thursday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_thursday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_friday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_friday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_saturday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_saturday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_sunday" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "websoc_section_meeting" ALTER COLUMN "meets_sunday" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "start_time" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "end_time" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_monday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_tuesday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_wednesday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_thursday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_friday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_saturday" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "larc_section" ADD COLUMN "meets_sunday" boolean DEFAULT false NOT NULL;