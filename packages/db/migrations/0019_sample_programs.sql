CREATE TABLE IF NOT EXISTS "sample_program" (
	"id" varchar PRIMARY KEY NOT NULL,
	"program_name" varchar NOT NULL,
	"sample_program" json NOT NULL,
	"program_notes" varchar[] NOT NULL
);
