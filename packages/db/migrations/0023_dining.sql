CREATE TABLE IF NOT EXISTS "dining_menu" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"price" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_period" (
	"id" varchar NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"start" time NOT NULL,
	"end" time NOT NULL,
	"name" text NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_menu" ADD CONSTRAINT "dining_menu_restaurant_id_dining_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."dining_restaurant"("id") ON DELETE cascade ON UPDATE cascade;
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