CREATE TABLE IF NOT EXISTS "map_location" (
	"id" numeric PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL,
	"image_urls" json
);
