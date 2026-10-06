ALTER TABLE "course_material" ALTER COLUMN "isbn" SET DATA TYPE varchar[] USING (
  CASE 
    WHEN "isbn" IS NULL OR trim("isbn") = '' THEN ARRAY[]::varchar[]
    ELSE string_to_array(replace("isbn", '; ', ';'), ';')::varchar[]
  END
);--> statement-breakpoint
ALTER TABLE "course_material" ALTER COLUMN "isbn" SET DEFAULT ARRAY[]::VARCHAR[];--> statement-breakpoint
ALTER TABLE "course_material" ALTER COLUMN "isbn" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "course_material" ALTER COLUMN "mms_id" SET DATA TYPE varchar[] USING (
  CASE 
    WHEN "mms_id" IS NULL OR trim("mms_id") = '' THEN ARRAY[]::varchar[]
    ELSE string_to_array(replace("mms_id", '| ', '|'), '|')::varchar[]
  END
);--> statement-breakpoint
ALTER TABLE "course_material" ALTER COLUMN "mms_id" SET DEFAULT ARRAY[]::VARCHAR[];--> statement-breakpoint
ALTER TABLE "course_material" ALTER COLUMN "mms_id" SET NOT NULL;

