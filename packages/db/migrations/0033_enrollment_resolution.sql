ALTER TABLE "websoc_section_enrollment" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "websoc_section_enrollment" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "websoc_meta" ADD COLUMN "last_snapshot" timestamp with time zone;