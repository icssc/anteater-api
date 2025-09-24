CREATE TABLE IF NOT EXISTS "college_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"requirements" jsonb NOT NULL,
	CONSTRAINT "college_requirement_requirements_unique" UNIQUE("requirements")
);
--> statement-breakpoint
ALTER TABLE "major" ADD COLUMN "college_requirement" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major" ADD CONSTRAINT "major_college_requirement_college_requirement_id_fk" FOREIGN KEY ("college_requirement") REFERENCES "public"."college_requirement"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "major_college_requirement_index" ON "major" USING btree ("college_requirement");