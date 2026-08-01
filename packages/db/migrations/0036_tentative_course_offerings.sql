CREATE TABLE "tentative_course_offering" (
	"source" varchar NOT NULL,
	"academic_year" varchar NOT NULL,
	"course_id" varchar NOT NULL,
	"year" varchar NOT NULL,
	"quarter" "term" NOT NULL,
	"instructors" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tentative_course_offering_source_academic_year_course_id_year_quarter_pk" PRIMARY KEY("source","academic_year","course_id","year","quarter")
);
--> statement-breakpoint
CREATE INDEX "tentative_course_offering_course_id_idx" ON "tentative_course_offering" USING btree ("course_id");