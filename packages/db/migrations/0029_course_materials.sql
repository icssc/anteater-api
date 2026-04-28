CREATE TYPE "public"."material_requirement" AS ENUM('Required', 'Recommended', 'Go to Class First');--> statement-breakpoint
CREATE TYPE "public"."textbook_format" AS ENUM('Physical', 'Electronic', 'Both', 'OER');--> statement-breakpoint
CREATE TABLE "course_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid,
	"year" varchar NOT NULL,
	"quarter" "term" NOT NULL,
	"department" varchar NOT NULL,
	"course_number" integer NOT NULL,
	"instructor" varchar NOT NULL,
	"isbn" varchar,
	"author" varchar,
	"title" varchar NOT NULL,
	"edition" varchar,
	"format" textbook_format NOT NULL,
	"requirement" "material_requirement",
	"mms_id" varchar,
	"link" text
);
--> statement-breakpoint
ALTER TABLE "course_material" ADD CONSTRAINT "course_material_section_id_websoc_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."websoc_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_material_section_id_index" ON "course_material" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "course_material_isbn_index" ON "course_material" USING btree ("isbn");