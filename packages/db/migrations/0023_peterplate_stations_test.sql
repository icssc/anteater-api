CREATE TABLE IF NOT EXISTS "station" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"restaurant_id" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
