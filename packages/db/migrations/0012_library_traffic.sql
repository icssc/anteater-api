CREATE TABLE IF NOT EXISTS "library_traffic" (
	"id" integer PRIMARY KEY NOT NULL,
	"location_name" varchar NOT NULL,
	"traffic_count" integer NOT NULL,
	"traffic_percentage" numeric NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_traffic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" integer NOT NULL,
	"traffic_count" integer NOT NULL,
	"traffic_percentage" numeric NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_traffic_history" ADD CONSTRAINT "library_traffic_history_location_id_library_traffic_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."library_traffic"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_id_index" ON "library_traffic" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_location_name_index" ON "library_traffic" USING btree ("location_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_history_timestamp_index" ON "library_traffic_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_history_location_id_index" ON "library_traffic_history" USING btree ("location_id");