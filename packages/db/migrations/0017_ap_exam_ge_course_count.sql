ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_1a_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_1b_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_2_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_3_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_4_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_5a_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_5b_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_6_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_7_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" ADD COLUMN "ge_8_courses_granted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_1a";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_1b";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_2";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_3";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_4";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_5a";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_5b";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_6";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_7";--> statement-breakpoint
ALTER TABLE "ap_exam_reward" DROP COLUMN IF EXISTS "grants_ge_8";