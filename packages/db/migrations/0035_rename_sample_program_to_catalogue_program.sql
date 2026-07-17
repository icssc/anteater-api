ALTER TABLE "sample_program_variation" RENAME TO "catalogue_program_variation";
ALTER TABLE "catalogue_program_variation" RENAME COLUMN "sample_program" TO "catalogue_program";
ALTER TABLE "catalogue_program_variation" RENAME CONSTRAINT "sample_program_variation_program_id_catalogue_program_id_fk" TO "catalogue_program_variation_program_id_catalogue_program_id_fk";