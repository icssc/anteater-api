CREATE TABLE "dining_meal_period_type" (
	"adobe_id" integer PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"position" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "dining_meal_period_type" ("adobe_id", "name", "position", "updated_at") VALUES
	(10, 'Breakfast', 50, NOW()),
	(13, 'Brunch', 70, NOW()),
	(25, 'Lunch', 90, NOW()),
	(51, 'Lite Lunch', 95, NOW()),
	(1, 'Afternoon Snack', 110, NOW()),
	(53, 'Limited Dinner', 130, NOW()),
	(16, 'Dinner', 140, NOW()),
	(22, 'Evening Snack', 160, NOW()),
	(31, 'Overnight', 170, NOW()),
	(4, 'All Day', 180, NOW()),
	(75, 'Happy Hour', 599, NOW()),
	(72, 'Late Night', 600, NOW())
ON CONFLICT ("adobe_id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "dining_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"upstream_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"start_date" date,
	"end_date" date,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_schedule_meal_period" (
	"schedule_id" uuid NOT NULL,
	"meal_period_type_id" integer NOT NULL,
	"sun_open" time,
	"sun_close" time,
	"mon_open" time,
	"mon_close" time,
	"tue_open" time,
	"tue_close" time,
	"wed_open" time,
	"wed_close" time,
	"thu_open" time,
	"thu_close" time,
	"fri_open" time,
	"fri_close" time,
	"sat_open" time,
	"sat_close" time,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dining_schedule_meal_period_pk" PRIMARY KEY("schedule_id","meal_period_type_id")
);
--> statement-breakpoint
ALTER TABLE "dining_period" RENAME COLUMN "adobe_id" TO "meal_period_type_id";--> statement-breakpoint
DROP INDEX "dining_period_adobe_id_date_restaurant_id_index";--> statement-breakpoint
ALTER TABLE "dining_schedule" ADD CONSTRAINT "dining_schedule_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_schedule_meal_period" ADD CONSTRAINT "dining_schedule_meal_period_schedule_id_dining_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."dining_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_schedule_meal_period" ADD CONSTRAINT "dining_schedule_meal_period_meal_period_type_id_dining_meal_period_type_adobe_id_fk" FOREIGN KEY ("meal_period_type_id") REFERENCES "public"."dining_meal_period_type"("adobe_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dining_schedule_restaurant_id_upstream_id_index" ON "dining_schedule" USING btree ("restaurant_id","upstream_id");--> statement-breakpoint
CREATE INDEX "dining_schedule_restaurant_id_index" ON "dining_schedule" USING btree ("restaurant_id");--> statement-breakpoint
INSERT INTO "dining_meal_period_type" ("adobe_id", "name", "position", "updated_at")
SELECT DISTINCT "meal_period_type_id", 'Unknown', 0, NOW()
FROM "dining_period"
WHERE "meal_period_type_id" NOT IN (SELECT "adobe_id" FROM "dining_meal_period_type")
ON CONFLICT ("adobe_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "dining_period" ADD CONSTRAINT "dining_period_meal_period_type_id_dining_meal_period_type_adobe_id_fk" FOREIGN KEY ("meal_period_type_id") REFERENCES "public"."dining_meal_period_type"("adobe_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dining_period_meal_period_type_id_date_restaurant_id_index" ON "dining_period" USING btree ("meal_period_type_id","date","restaurant_id");--> statement-breakpoint
ALTER TABLE "dining_period" DROP COLUMN "name";