ALTER TABLE "study_room" ALTER COLUMN "capacity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_room" ALTER COLUMN "tech_enhanced" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_room" ADD COLUMN "url" varchar;