CREATE TABLE IF NOT EXISTS "dining_diet_restriction" (
	"dish_id" varchar PRIMARY KEY NOT NULL,
	"contains_eggs" boolean NOT NULL,
	"contains_fish" boolean NOT NULL,
	"contains_milk" boolean NOT NULL,
	"contains_peanuts" boolean NOT NULL,
	"contains_sesame" boolean NOT NULL,
	"contains_shellfish" boolean NOT NULL,
	"contains_soy" boolean NOT NULL,
	"contains_tree_nuts" boolean NOT NULL,
	"contains_wheat" boolean NOT NULL,
	"is_gluten_free" boolean NOT NULL,
	"is_halal" boolean NOT NULL,
	"is_kosher" boolean NOT NULL,
	"is_locally_grown" boolean NOT NULL,
	"is_organic" boolean NOT NULL,
	"is_vegan" boolean NOT NULL,
	"is_vegetarian" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_dish" (
	"id" varchar PRIMARY KEY NOT NULL,
	"station_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar NOT NULL,
	"ingredients" varchar,
	"category" varchar NOT NULL,
	"image_url" varchar,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_dish_to_period" (
    "period_id" uuid NOT NULL,
    "dish_id" varchar NOT NULL,
    CONSTRAINT dining_dish_to_period_pk PRIMARY KEY (period_id, dish_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_event" (
	"title" varchar NOT NULL,
	"image" varchar,
	"restaurant_id" varchar NOT NULL,
	"description" varchar,
	"start" timestamp,
	"end" timestamp,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dining_event_pk" PRIMARY KEY("title","restaurant_id","start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_nutrition_info" (
	"dish_id" varchar PRIMARY KEY NOT NULL,
	"serving_size" varchar,
	"serving_unit" varchar,
	"calories" numeric(10, 2),
	"total_fat_g" numeric(10, 2),
	"trans_fat_g" numeric(10, 2),
	"saturated_fat_g" numeric(10, 2),
	"cholesterol_mg" numeric(10, 2),
	"sodium_mg" numeric(10, 2),
	"total_carbs_g" numeric(10, 2),
	"dietary_fiber_g" numeric(10, 2),
	"sugars_g" numeric(10, 2),
	"protein_g" numeric(10, 2),
	"calcium" numeric(10, 2),
	"iron" numeric(10, 2),
	"vitamin_a" numeric(10, 2),
	"vitamin_c" numeric(10, 2),
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adobe_id" integer NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"name" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_restaurant" (
	"id" varchar PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_station" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_diet_restriction" ADD CONSTRAINT "dining_diet_restriction_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish" ADD CONSTRAINT "dining_dish_station_id_dining_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."dining_station"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish_to_period" ADD CONSTRAINT "dining_dish_to_period_period_id_dining_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."dining_period"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish_to_period" ADD CONSTRAINT "dining_dish_to_period_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_event" ADD CONSTRAINT "dining_event_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_nutrition_info" ADD CONSTRAINT "dining_nutrition_info_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_period" ADD CONSTRAINT "dining_period_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_station" ADD CONSTRAINT "dining_station_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_dish_station_id_index" ON "dining_dish" USING btree ("station_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dining_period_adobe_id_date_restaurant_id_index" ON "dining_period" USING btree ("adobe_id","date","restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_period_date_index" ON "dining_period" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_period_restaurant_id_index" ON "dining_period" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_station_restaurant_id_index" ON "dining_station" USING btree ("restaurant_id");