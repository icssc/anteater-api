CREATE TYPE "public"."restaurant_id_enum" AS ENUM('3056', '3314');--> statement-breakpoint
CREATE TYPE "public"."restaurant_name_enum" AS ENUM('anteatery', 'brandywine');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurants" (
	"id" "restaurant_id_enum" PRIMARY KEY NOT NULL,
	"name" "restaurant_name_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"restaurant_id" "restaurant_id_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DROP TABLE "station" CASCADE;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stations" ADD CONSTRAINT "stations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
