import { index, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { websocSection } from ".";

export const materialTerms = ["Fall", "Winter", "Spring", "Summer"] as const;

export const textbookFormats = ["Physical", "Electronic", "Both", "OER"] as const;
export const textbookFormat = pgEnum("textbook_format", textbookFormats);
export type TextbookFormat = (typeof textbookFormats)[number];

export const materialRequirements = ["Required", "Recommended", "GoToClassFirst"] as const;
export const materialRequirement = pgEnum("material_requirement", materialRequirements);
export type MaterialRequirement = (typeof materialRequirements)[number];

export const courseMaterial = pgTable(
  "course_material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .references(() => websocSection.id)
      .notNull(),
    isbn: varchar("isbn"),
    author: varchar("author"),
    title: varchar("title").notNull(),
    edition: varchar("edition"),
    format: textbookFormat("format").notNull(),
    requirement: materialRequirement("requirement"),
    mmsId: varchar("mms_id"),
    link: text("link"),
  },
  (table) => [index().on(table.sectionId)],
);
