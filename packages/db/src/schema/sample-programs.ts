import { sql } from "drizzle-orm";
import { jsonb, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const StandingYear = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
export type StandingYearType = (typeof StandingYear)[number];

export type CourseEntry = { type: "courseId"; value: string } | { type: "unknown"; value: string };

export type SampleProgramEntry = {
  year: StandingYearType;
  fall: CourseEntry[];
  winter: CourseEntry[];
  spring: CourseEntry[];
};

export const catalogProgram = pgTable("catalogue_program", {
  id: varchar("id").primaryKey(),
  programName: varchar("program_name").notNull(),
});

export const sampleProgramVariation = pgTable("sample_program_variation", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: varchar("program_id")
    .notNull()
    .references(() => catalogProgram.id, { onDelete: "cascade" }),
  label: varchar("label"),
  sampleProgram: jsonb("sample_program").$type<SampleProgramEntry[]>().notNull(),
  variationNotes: varchar("variation_notes").array().notNull().default(sql`ARRAY[]::VARCHAR[]`),
});
