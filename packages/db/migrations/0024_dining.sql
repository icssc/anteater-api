CREATE TABLE IF NOT EXISTS "dining_dish" (
	"id" varchar PRIMARY KEY NOT NULL,
	"station_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar NOT NULL,
	"ingredients" varchar DEFAULT 'Ingredient Statement Not Available',
	"category" varchar NOT NULL,
	"num_ratings" integer DEFAULT 0 NOT NULL,
	"total_rating" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_nutrition_info" (
	"dish_id" varchar PRIMARY KEY NOT NULL,
	"serving_size" varchar,
	"serving_unit" varchar,
	"calories" varchar,
	"total_fat_g" varchar,
	"trans_fat_g" varchar,
	"saturated_fat_g" varchar,
	"cholesterol_mg" varchar,
	"sodium_mg" varchar,
	"total_carbs_g" varchar,
	"dietary_fiber_g" varchar,
	"sugars_g" varchar,
	"protein_g" varchar,
	"calcium" varchar,
	"iron" varchar,
	"vitamin_a" varchar,
	"vitamin_c" varchar,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_menu" ALTER COLUMN "id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "dining_menu" ALTER COLUMN "period_id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "dining_period" ALTER COLUMN "name" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "dining_station" ALTER COLUMN "id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "dining_station" ALTER COLUMN "name" SET DATA TYPE varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish" ADD CONSTRAINT "dining_dish_station_id_dining_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."dining_station"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_nutrition_info" ADD CONSTRAINT "dining_nutrition_info_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "dining_menu" DROP COLUMN IF EXISTS "price";