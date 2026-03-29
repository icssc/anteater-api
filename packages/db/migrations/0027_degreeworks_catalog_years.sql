CREATE TABLE IF NOT EXISTS "dw_major_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"specialization_required" boolean NOT NULL,
	"college_requirement" bigint,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dw_minor_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dw_specialization_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "college_requirement" RENAME TO "dw_college_requirement";--> statement-breakpoint
ALTER TABLE "degree" RENAME TO "dw_degree";--> statement-breakpoint
ALTER TABLE "major" RENAME TO "dw_major";--> statement-breakpoint
ALTER TABLE "minor" RENAME TO "dw_minor";--> statement-breakpoint
ALTER TABLE "school_requirement" RENAME TO "dw_school";--> statement-breakpoint
ALTER TABLE "specialization" RENAME TO "dw_specialization";--> statement-breakpoint
ALTER TABLE "dw_college_requirement" DROP CONSTRAINT "college_requirement_requirements_hash_unique";--> statement-breakpoint
ALTER TABLE "dw_major" DROP CONSTRAINT "major_degree_id_degree_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_major" DROP CONSTRAINT "major_college_requirement_college_requirement_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_specialization" DROP CONSTRAINT "specialization_major_id_major_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "major_degree_id_index";--> statement-breakpoint
DROP INDEX IF EXISTS "major_college_requirement_index";--> statement-breakpoint
DROP INDEX IF EXISTS "specialization_major_id_index";--> statement-breakpoint
ALTER TABLE "dw_college_requirement" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "dw_college_requirement" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "dw_college_requirement" drop column "id";--> statement-breakpoint
ALTER TABLE "dw_college_requirement" ADD COLUMN "id" bigint PRIMARY KEY GENERATED ALWAYS AS (('x' || substr(md5(name), 1, 16))::bit(64)::bigint # jsonb_hash_extended(requirements, 0)) STORED NOT NULL;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'dw_school'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "dw_school" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "dw_school" ALTER COLUMN "requirements" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "dw_school" ADD COLUMN "catalog_year" varchar NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_major_requirement" ADD CONSTRAINT "dw_major_requirement_program_id_dw_major_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_major_requirement" ADD CONSTRAINT "dw_major_requirement_college_requirement_dw_college_requirement_id_fk" FOREIGN KEY ("college_requirement") REFERENCES "public"."dw_college_requirement"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_minor_requirement" ADD CONSTRAINT "dw_minor_requirement_program_id_dw_minor_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_minor"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_specialization_requirement" ADD CONSTRAINT "dw_specialization_requirement_program_id_dw_specialization_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_specialization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dw_major_requirement_program_id_catalog_year_index" ON "dw_major_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_major_requirement_catalog_year_index" ON "dw_major_requirement" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dw_minor_requirement_program_id_catalog_year_index" ON "dw_minor_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_minor_requirement_catalog_year_index" ON "dw_minor_requirement" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dw_specialization_requirement_program_id_catalog_year_index" ON "dw_specialization_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_specialization_requirement_catalog_year_index" ON "dw_specialization_requirement" USING btree ("catalog_year");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_major" ADD CONSTRAINT "dw_major_degree_id_dw_degree_id_fk" FOREIGN KEY ("degree_id") REFERENCES "public"."dw_degree"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dw_specialization" ADD CONSTRAINT "dw_specialization_major_id_dw_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_major_degree_id_index" ON "dw_major" USING btree ("degree_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dw_school_id_catalog_year_index" ON "dw_school" USING btree ("id","catalog_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_school_catalog_year_index" ON "dw_school" USING btree ("catalog_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dw_specialization_major_id_index" ON "dw_specialization" USING btree ("major_id");--> statement-breakpoint
ALTER TABLE "dw_college_requirement" DROP COLUMN IF EXISTS "requirements_hash";--> statement-breakpoint
ALTER TABLE "dw_major" DROP COLUMN IF EXISTS "specialization_required";--> statement-breakpoint
ALTER TABLE "dw_major" DROP COLUMN IF EXISTS "college_requirement";--> statement-breakpoint
ALTER TABLE "dw_major" DROP COLUMN IF EXISTS "requirements";--> statement-breakpoint
ALTER TABLE "dw_minor" DROP COLUMN IF EXISTS "requirements";--> statement-breakpoint
ALTER TABLE "dw_specialization" DROP COLUMN IF EXISTS "requirements";