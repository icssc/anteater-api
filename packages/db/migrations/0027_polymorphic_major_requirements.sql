CREATE TABLE IF NOT EXISTS "major_requirement" (
	"requirements" jsonb NOT NULL,
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS (jsonb_hash_extended(requirements, 0)) STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "major_specialization_to_requirement" (
	"id" varchar PRIMARY KEY GENERATED ALWAYS AS (
        CASE WHEN "major_specialization_to_requirement"."specialization_id" IS NOT NULL
        THEN "major_specialization_to_requirement"."major_id" || '+' || "major_specialization_to_requirement"."specialization_id"
        ELSE "major_specialization_to_requirement"."major_id"
        END) STORED NOT NULL,
	"major_id" varchar NOT NULL,
	"specialization_id" varchar,
	"requirement_id" bigint
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_major_id_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."major"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_specialization_id_specialization_id_fk" FOREIGN KEY ("specialization_id") REFERENCES "public"."specialization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_requirement_id_major_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."major_requirement"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "major" DROP COLUMN IF EXISTS "requirements";