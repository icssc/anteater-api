ALTER TABLE "course" ADD COLUMN "department_alias" varchar;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_search_index" ON "course" USING gin ((
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("id", '')), 'A') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("department", '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("department_alias", '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("course.shortenedDept", '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("course_number", '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("course_numeric"::TEXT, '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("title", '')), 'C') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("description", '')), 'D')
));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructor_search_index" ON "instructor" USING gin ((
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("ucinetid", '')), 'A') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("name", '')), 'B') ||
 SETWEIGHT(TO_TSVECTOR('english', COALESCE("title", '')), 'B')
));
