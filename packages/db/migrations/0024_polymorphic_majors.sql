CREATE TABLE IF NOT EXISTS "major_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirements" jsonb NOT NULL,
	"requirements_hash" bigint GENERATED ALWAYS AS (jsonb_hash_extended(requirements, 0)) STORED,
	CONSTRAINT "major_requirement_requirements_hash_unique" UNIQUE("requirements_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "major_spec_pair_to_requirement" (
	"id" varchar PRIMARY KEY GENERATED ALWAYS AS (
        CASE WHEN "major_spec_pair_to_requirement"."spec_id" IS NOT NULL
        THEN "major_spec_pair_to_requirement"."major_id" || '+' || "major_spec_pair_to_requirement"."spec_id"
        ELSE "major_spec_pair_to_requirement"."major_id"
        END) STORED NOT NULL,
	"major_id" varchar NOT NULL,
	"spec_id" varchar,
	"requirement_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_spec_pair_to_requirement" ADD CONSTRAINT "major_spec_pair_to_requirement_major_id_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."major"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_spec_pair_to_requirement" ADD CONSTRAINT "major_spec_pair_to_requirement_spec_id_specialization_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."specialization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_spec_pair_to_requirement" ADD CONSTRAINT "major_spec_pair_to_requirement_requirement_id_major_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."major_requirement"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "major" DROP COLUMN IF EXISTS "requirements";