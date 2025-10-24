CREATE TABLE IF NOT EXISTS "catalogue_program" (
	"id" varchar PRIMARY KEY NOT NULL,
	"program_name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sample_program_variation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" varchar NOT NULL,
	"label" varchar,
	"sample_program" json NOT NULL,
	"variation_notes" varchar[] DEFAULT ARRAY[]::VARCHAR[]
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sample_program_variation" ADD CONSTRAINT "sample_program_variation_program_id_catalogue_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."catalogue_program"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
