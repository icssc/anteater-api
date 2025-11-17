CREATE TABLE IF NOT EXISTS "library_traffic" (
	"id" integer PRIMARY KEY NOT NULL,
	"library_name" varchar NOT NULL,
	"location_name" varchar NOT NULL,
	"traffic_count" integer NOT NULL,
	"traffic_percentage" real NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_traffic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" integer NOT NULL,
	"traffic_count" integer NOT NULL,
	"traffic_percentage" real NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_traffic_history" ADD CONSTRAINT "library_traffic_history_location_id_library_traffic_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."library_traffic"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_library_name_index" ON "library_traffic" USING btree ("library_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_traffic_location_name_index" ON "library_traffic" USING btree ("location_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_traffic_history_location_id_timestamp_index" ON "library_traffic_history" USING btree ("location_id","timestamp");