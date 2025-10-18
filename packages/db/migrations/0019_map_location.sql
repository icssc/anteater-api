CREATE TABLE IF NOT EXISTS "map_location" (
	"id" varchar PRIMARY KEY NOT NULL,
	"cat_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"polygon" jsonb,
	"image_urls" text[] NOT NULL
);
