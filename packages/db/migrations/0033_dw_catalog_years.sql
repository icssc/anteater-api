CREATE TABLE "dw_degree" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"division" "division" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_major" (
	"id" varchar PRIMARY KEY NOT NULL,
	"degree_id" varchar NOT NULL,
	"code" varchar NOT NULL,
	"name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_major_requirement" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS (jsonb_hash_extended(requirements, 0)) STORED NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_major_specialization_to_requirement" (
	"major_id" varchar NOT NULL,
	"specialization_id" varchar,
	"catalog_year" varchar NOT NULL,
	"requirement_id" bigint NOT NULL,
	CONSTRAINT "dw_major_specialization_to_requirement_major_id_specialization_id_catalog_year_unique" UNIQUE NULLS NOT DISTINCT("major_id","specialization_id","catalog_year")
);
--> statement-breakpoint
CREATE TABLE "dw_major_year" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"specialization_required" boolean NOT NULL,
	"college_requirements_title" varchar,
	"college_requirements" jsonb
);
--> statement-breakpoint
CREATE TABLE "dw_minor" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_minor_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_school_requirement" (
	"id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_specialization" (
	"id" varchar PRIMARY KEY NOT NULL,
	"major_id" varchar NOT NULL,
	"name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw_specialization_requirement" (
	"program_id" varchar NOT NULL,
	"catalog_year" varchar NOT NULL,
	"requirements" jsonb NOT NULL
);
--> statement-breakpoint
DROP TABLE "college_requirement" CASCADE;--> statement-breakpoint
DROP TABLE "degree" CASCADE;--> statement-breakpoint
DROP TABLE "major" CASCADE;--> statement-breakpoint
DROP TABLE "major_requirement" CASCADE;--> statement-breakpoint
DROP TABLE "major_specialization_to_requirement" CASCADE;--> statement-breakpoint
DROP TABLE "minor" CASCADE;--> statement-breakpoint
DROP TABLE "school_requirement" CASCADE;--> statement-breakpoint
DROP TABLE "specialization" CASCADE;--> statement-breakpoint
ALTER TABLE "dw_major" ADD CONSTRAINT "dw_major_degree_id_dw_degree_id_fk" FOREIGN KEY ("degree_id") REFERENCES "public"."dw_degree"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_major_id_dw_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_specialization_id_dw_specialization_id_fk" FOREIGN KEY ("specialization_id") REFERENCES "public"."dw_specialization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_specialization_to_requirement" ADD CONSTRAINT "dw_major_specialization_to_requirement_requirement_id_dw_major_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."dw_major_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_major_year" ADD CONSTRAINT "dw_major_year_program_id_dw_major_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_major"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_minor_requirement" ADD CONSTRAINT "dw_minor_requirement_program_id_dw_minor_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_minor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_specialization" ADD CONSTRAINT "dw_specialization_major_id_dw_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."dw_major"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dw_specialization_requirement" ADD CONSTRAINT "dw_specialization_requirement_program_id_dw_specialization_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dw_specialization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dw_major_degree_id_index" ON "dw_major" USING btree ("degree_id");--> statement-breakpoint
CREATE INDEX "dw_major_specialization_to_requirement_catalog_year_index" ON "dw_major_specialization_to_requirement" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_major_year_program_id_catalog_year_index" ON "dw_major_year" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_major_year_catalog_year_index" ON "dw_major_year" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_minor_requirement_program_id_catalog_year_index" ON "dw_minor_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_minor_requirement_catalog_year_index" ON "dw_minor_requirement" USING btree ("catalog_year");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_school_requirement_id_catalog_year_index" ON "dw_school_requirement" USING btree ("id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_specialization_major_id_index" ON "dw_specialization" USING btree ("major_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dw_specialization_requirement_program_id_catalog_year_index" ON "dw_specialization_requirement" USING btree ("program_id","catalog_year");--> statement-breakpoint
CREATE INDEX "dw_specialization_requirement_catalog_year_index" ON "dw_specialization_requirement" USING btree ("catalog_year");