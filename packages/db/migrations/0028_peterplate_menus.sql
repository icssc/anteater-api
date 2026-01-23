CREATE TABLE IF NOT EXISTS "menus" (
	"id" text PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" "restaurant_id_enum" NOT NULL,
	"price" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menus" ADD CONSTRAINT "menus_period_id_date_restaurant_id_periods_id_date_restaurant_id_fk" FOREIGN KEY ("period_id","date","restaurant_id") REFERENCES "public"."periods"("id","date","restaurant_id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
