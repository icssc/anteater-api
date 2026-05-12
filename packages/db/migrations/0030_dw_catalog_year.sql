CREATE TABLE "dw_major_year" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"specialization_required" boolean NOT NULL,
	"college_requirements_title" varchar,
	"college_requirements" jsonb
);
--> statement-breakpoint
CREATE TABLE "dw_minor_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_specialization_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "college_requirement" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "college_requirement" CASCADE;--> statement-breakpoint
ALTER TABLE "degree" RENAME TO "dw_degree";--> statement-breakpoint
ALTER TABLE "major" RENAME TO "dw_major";--> statement-breakpoint
ALTER TABLE "major_requirement" RENAME TO "dw_major_requirement";--> statement-breakpoint
ALTER TABLE "major_specialization_to_requirement" RENAME TO "dw_major_specialization_to_requirement";--> statement-breakpoint
ALTER TABLE "minor" RENAME TO "dw_minor";--> statement-breakpoint
ALTER TABLE "school_requirement" RENAME TO "dw_school_requirement";--> statement-breakpoint
ALTER TABLE "specialization" RENAME TO "dw_specialization";--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" DROP CONSTRAINT "major_specialization_to_requirement_major_id_specialization_id_unique";--> statement-breakpoint
ALTER TABLE "dw_major" DROP CONSTRAINT "major_degree_id_degree_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_major" DROP CONSTRAINT "major_college_requirement_id_college_requirement_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" DROP CONSTRAINT "major_specialization_to_requirement_major_id_major_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" DROP CONSTRAINT "major_specialization_to_requirement_specialization_id_specialization_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" DROP CONSTRAINT "major_specialization_to_requirement_requirement_id_major_requirement_id_fk";
--> statement-breakpoint
ALTER TABLE "dw_specialization" DROP CONSTRAINT "specialization_major_id_major_id_fk";
--> statement-breakpoint
DROP INDEX "major_degree_id_index";--> statement-breakpoint
DROP INDEX "major_college_requirement_id_index";--> statement-breakpoint
DROP INDEX "specialization_major_id_index";--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD COLUMN "catalog_year" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "dw_school_requirement" ADD COLUMN "catalog_year" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "dw_major_year" ADD CONSTRAINT "dw_major_year_program_id_dw_major_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_major"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_minor_requirement" ADD CONSTRAINT "dw_minor_requirement_program_id_dw_minor_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_minor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_specialization_requirement" ADD CONSTRAINT "dw_specialization_requirement_program_id_dw_specialization_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_specialization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dw_major_year_program_id_catalog_year_index" ON "dw_major_year" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_minor_requirement_program_id_catalog_year_index" ON "dw_minor_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_minor_requirement_catalog_year_index" ON "dw_minor_requirement" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_specialization_requirement_program_id_catalog_year_index" ON "dw_specialization_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_specialization_requirement_catalog_year_index" ON "dw_specialization_requirement" USING btree ("catalog_year");--> statement-breakpoint
ALTER TABLE "dw_major" ADD CONSTRAINT "dw_major_degree_id_dw_degree_id_fk" FOREIGN KEY ("degree_id") REFERENCES "public"."dw_degree"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_major_id_dw_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_specialization_id_dw_specialization_id_fk" FOREIGN KEY ("specialization_id") REFERENCES "public"."dw_specialization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_requirement_id_dw_major_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."dw_major_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_specialization" ADD CONSTRAINT "dw_specialization_major_id_dw_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dw_major_degree_id_index" ON "dw_major" USING btree ("degree_id");--> statement-breakpoint
CREATE INDEX "dw_specialization_major_id_index" ON "dw_specialization" USING btree ("major_id");--> statement-breakpoint
ALTER TABLE "dw_major" DROP COLUMN "specialization_required";--> statement-breakpoint
ALTER TABLE "dw_major" DROP COLUMN "college_requirement_id";--> statement-breakpoint
ALTER TABLE "dw_minor" DROP COLUMN "requirements";--> statement-breakpoint
ALTER TABLE "dw_specialization" DROP COLUMN "requirements";--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_major_id_specialization_id_unique" UNIQUE NULLS NOT DISTINCT("major_id","specialization_id");