CREATE TABLE "major_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirements" jsonb NOT NULL,
	"requirements_hash" bigint GENERATED ALWAYS AS (jsonb_hash_extended(requirements, 0)) STORED NOT NULL,
	CONSTRAINT "major_requirement_requirements_hash_unique" UNIQUE("requirements_hash") DEFERRABLE INITIALLY IMMEDIATE
);
--> statement-breakpoint
CREATE TABLE "major_specialization_to_requirement" (
	"major_id" varchar NOT NULL,
	"specialization_id" varchar,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "major_specialization_to_requirement_major_id_specialization_id_unique" UNIQUE NULLS NOT DISTINCT("major_id","specialization_id")
);
--> statement-breakpoint
ALTER TABLE "major" RENAME COLUMN "college_requirement" TO "college_requirement_id";--> statement-breakpoint
ALTER TABLE "major" DROP CONSTRAINT "major_college_requirement_college_requirement_id_fk";
--> statement-breakpoint
DROP INDEX "major_college_requirement_index";--> statement-breakpoint
ALTER TABLE "college_requirement" ALTER COLUMN "requirements_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_major_id_major_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."major"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_specialization_id_specialization_id_fk" FOREIGN KEY ("specialization_id") REFERENCES "public"."specialization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_specialization_to_requirement" ADD CONSTRAINT "major_specialization_to_requirement_requirement_id_major_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."major_requirement"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "major" ADD CONSTRAINT "major_college_requirement_id_college_requirement_id_fk" FOREIGN KEY ("college_requirement_id") REFERENCES "public"."college_requirement"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
CREATE INDEX "major_college_requirement_id_index" ON "major" USING btree ("college_requirement_id");--> statement-breakpoint
ALTER TABLE "major" DROP COLUMN "requirements";