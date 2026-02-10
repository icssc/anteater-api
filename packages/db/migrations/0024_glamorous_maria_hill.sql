CREATE TABLE IF NOT EXISTS "major_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"major_id" varchar NOT NULL,
	"spec_id" varchar,
	"requirements" json NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_requirement" ADD CONSTRAINT "major_requirement_major_id_specialization_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."specialization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_requirement" ADD CONSTRAINT "major_requirement_spec_id_specialization_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."specialization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "major" DROP COLUMN IF EXISTS "requirements";