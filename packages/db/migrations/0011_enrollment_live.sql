CREATE TABLE IF NOT EXISTS "websoc_section_enrollment_live" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"num_currently_total_enrolled" integer,
	"num_currently_section_enrolled" integer,
	"max_capacity" integer NOT NULL,
	"num_on_waitlist" integer,
	"num_waitlist_cap" integer,
	"num_requested" integer,
	"num_new_only_reserved" integer,
	"status" "websoc_status",
	"restriction_string" varchar NOT NULL,
	"restriction_a" boolean DEFAULT false NOT NULL,
	"restriction_b" boolean DEFAULT false NOT NULL,
	"restriction_c" boolean DEFAULT false NOT NULL,
	"restriction_d" boolean DEFAULT false NOT NULL,
	"restriction_e" boolean DEFAULT false NOT NULL,
	"restriction_f" boolean DEFAULT false NOT NULL,
	"restriction_g" boolean DEFAULT false NOT NULL,
	"restriction_h" boolean DEFAULT false NOT NULL,
	"restriction_i" boolean DEFAULT false NOT NULL,
	"restriction_j" boolean DEFAULT false NOT NULL,
	"restriction_k" boolean DEFAULT false NOT NULL,
	"restriction_l" boolean DEFAULT false NOT NULL,
	"restriction_m" boolean DEFAULT false NOT NULL,
	"restriction_n" boolean DEFAULT false NOT NULL,
	"restriction_o" boolean DEFAULT false NOT NULL,
	"restriction_r" boolean DEFAULT false NOT NULL,
	"restriction_s" boolean DEFAULT false NOT NULL,
	"restriction_x" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "websoc_section_enrollment_live" ADD CONSTRAINT "websoc_section_enrollment_live_section_id_websoc_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."websoc_section"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_enrollment_live_section_id_index" ON "websoc_section_enrollment_live" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websoc_section_enrollment_live_scraped_at_index" ON "websoc_section_enrollment_live" USING btree ("scraped_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websoc_section_enrollment_live_section_id_scraped_at_index" ON "websoc_section_enrollment_live" USING btree ("section_id","scraped_at");