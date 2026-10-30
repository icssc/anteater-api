CREATE TABLE "ib_exam" (
	"id" varchar PRIMARY KEY NOT NULL,
	"catalogue_name" varchar
);
--> statement-breakpoint
CREATE TABLE "ib_exam_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"units_granted" integer NOT NULL,
	"elective_units_granted" integer NOT NULL,
	"ge_1a_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_1b_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_2_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_3_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_4_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_5a_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_5b_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_6_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_7_courses_granted" integer DEFAULT 0 NOT NULL,
	"ge_8_courses_granted" integer DEFAULT 0 NOT NULL,
	"courses_granted" json NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ib_exam_to_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"reward" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ib_exam_to_reward" ADD CONSTRAINT "ib_exam_to_reward_exam_id_ib_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."ib_exam"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ib_exam_to_reward" ADD CONSTRAINT "ib_exam_to_reward_reward_ib_exam_reward_id_fk" FOREIGN KEY ("reward") REFERENCES "public"."ib_exam_reward"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ib_exam_to_reward_exam_id_score_index" ON "ib_exam_to_reward" USING btree ("exam_id","score");