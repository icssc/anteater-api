CREATE TABLE IF NOT EXISTS "map_location" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL
);
