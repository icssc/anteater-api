CREATE TABLE IF NOT EXISTS "library_traffic" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"trafficCount" integer NOT NULL,
	"trafficPercentage" numeric NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_traffic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locationId" integer NOT NULL,
	"trafficCount" integer NOT NULL,
	"trafficPercentage" numeric NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_traffic_history" ADD CONSTRAINT "library_traffic_history_locationId_library_traffic_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."library_traffic"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_id_index" ON "library_traffic" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_name_index" ON "library_traffic" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_history_timestamp_index" ON "library_traffic_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_traffic_history_locationId_index" ON "library_traffic_history" USING btree ("locationId");