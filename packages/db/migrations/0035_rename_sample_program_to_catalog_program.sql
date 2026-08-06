ALTER TABLE "sample_program_variation" RENAME TO "catalog_program_variation";--> statement-breakpoint
ALTER TABLE "catalog_program_variation" RENAME COLUMN "sample_program" TO "catalog_program";--> statement-breakpoint
ALTER TABLE "catalog_program_variation" DROP CONSTRAINT "sample_program_variation_program_id_catalogue_program_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog_program_variation" ADD CONSTRAINT "catalog_program_variation_program_id_catalogue_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."catalogue_program"("id") ON DELETE cascade ON UPDATE no action;