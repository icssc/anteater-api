CREATE TABLE IF NOT EXISTS "periods" (
	"id" text NOT NULL,
	"date" date NOT NULL,
	"restaurant_id" "restaurant_id_enum" NOT NULL,
	"start" time NOT NULL,
	"end" time NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "periods_id_date_restaurant_id_pk" PRIMARY KEY("id","date","restaurant_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "periods" ADD CONSTRAINT "periods_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
