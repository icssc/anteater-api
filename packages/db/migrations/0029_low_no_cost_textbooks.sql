CREATE TYPE "public"."material_requirement" AS ENUM('Required', 'Recommended');--> statement-breakpoint
CREATE TYPE "public"."textbook_format" AS ENUM('Physical', 'Electronic', 'Both');--> statement-breakpoint
CREATE TABLE "low_cost_textbook" (
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
	"requirement" "material_requirement" NOT NULL,
	"mms_id" varchar,
	"link" text
);
--> statement-breakpoint
ALTER TABLE "low_cost_textbook" ADD CONSTRAINT "low_cost_textbook_section_id_websoc_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."websoc_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "low_cost_textbook_section_id_index" ON "low_cost_textbook" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "low_cost_textbook_isbn_index" ON "low_cost_textbook" USING btree ("isbn");