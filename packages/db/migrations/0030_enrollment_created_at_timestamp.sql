ALTER TABLE "websoc_section_enrollment" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "websoc_section_enrollment" ALTER COLUMN "created_at" SET DEFAULT now();