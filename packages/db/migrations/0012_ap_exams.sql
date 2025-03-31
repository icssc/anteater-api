CREATE TABLE IF NOT EXISTS "ap_exam_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"units_granted" integer,
	"elective_units_granted" integer,
	"ge_1a" boolean DEFAULT false NOT NULL,
	"ge_1b" boolean DEFAULT false NOT NULL,
	"ge_2" boolean DEFAULT false NOT NULL,
	"ge_3" boolean DEFAULT false NOT NULL,
	"ge_4" boolean DEFAULT false NOT NULL,
	"ge_5a" boolean DEFAULT false NOT NULL,
	"ge_5b" boolean DEFAULT false NOT NULL,
	"ge_6" boolean DEFAULT false NOT NULL,
	"ge_7" boolean DEFAULT false NOT NULL,
	"ge_8" boolean DEFAULT false NOT NULL,
	"courses_granted" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ap_exam_to_reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"reward" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ap_exams" (
	"id" varchar PRIMARY KEY NOT NULL,
	"catalogue_name" varchar
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ap_exam_to_reward" ADD CONSTRAINT "ap_exam_to_reward_exam_id_ap_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."ap_exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ap_exam_to_reward" ADD CONSTRAINT "ap_exam_to_reward_reward_ap_exam_reward_id_fk" FOREIGN KEY ("reward") REFERENCES "public"."ap_exam_reward"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
