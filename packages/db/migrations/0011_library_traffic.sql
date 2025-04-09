CREATE TABLE IF NOT EXISTS "library_traffic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_name" varchar NOT NULL,
	"traffic_count" integer NOT NULL,
	"traffic_percentage" numeric(4, 2) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_timestamp_index" ON "library_traffic" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_location_name_index" ON "library_traffic" USING btree ("location_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_traffic_location_name_timestamp_index" ON "library_traffic" USING btree ("location_name","timestamp");