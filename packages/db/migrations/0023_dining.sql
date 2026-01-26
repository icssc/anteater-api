CREATE TABLE IF NOT EXISTS "dining_diet_restriction" (
	"dish_id" text PRIMARY KEY NOT NULL,
	"contains_eggs" boolean,
	"contains_fish" boolean,
	"contains_milk" boolean,
	"contains_peanuts" boolean,
	"contains_sesame" boolean,
	"contains_shellfish" boolean,
	"contains_soy" boolean,
	"contains_tree_nuts" boolean,
	"contains_wheat" boolean,
	"is_gluten_free" boolean,
	"is_halal" boolean,
	"is_kosher" boolean,
	"is_locally_grown" boolean,
	"is_organic" boolean,
	"is_vegan" boolean,
	"is_vegetarian" boolean,
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
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_dish_to_menu" (
	"menu_id" varchar NOT NULL,
	"dish_id" varchar NOT NULL,
    CONSTRAINT dining_dish_to_menu_pk PRIMARY KEY (menu_id, dish_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_event" (
	"title" varchar NOT NULL,
	"image" varchar,
	"restaurant_id" varchar NOT NULL,
	"short_description" varchar,
	"long_description" varchar,
	"start" timestamp,
	"end" timestamp,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dining_event_pk" PRIMARY KEY("title","restaurant_id","start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_menu" (
	"id" varchar PRIMARY KEY NOT NULL,
	"period_id" varchar NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" varchar NOT NULL,
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
CREATE TABLE IF NOT EXISTS "dining_period" (
	"id" varchar NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"start" time NOT NULL,
	"end" time NOT NULL,
	"name" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_restaurant" (
	"id" varchar PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" varchar NOT NULL
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
 ALTER TABLE "dining_diet_restriction" ADD CONSTRAINT "dining_diet_restriction_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish" ADD CONSTRAINT "dining_dish_station_id_dining_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."dining_station"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish_to_menu" ADD CONSTRAINT "dining_dish_to_menu_menu_id_dining_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."dining_menu"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_dish_to_menu" ADD CONSTRAINT "dining_dish_to_menu_dish_id_dining_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dining_dish"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_event" ADD CONSTRAINT "dining_event_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_menu" ADD CONSTRAINT "dining_menu_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE cascade;
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
DO $$ BEGIN
 ALTER TABLE "dining_period" ADD CONSTRAINT "dining_period_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_station" ADD CONSTRAINT "dining_station_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dining_period_id_date_restaurant_id_index" ON "dining_period" USING btree ("id","date","restaurant_id");