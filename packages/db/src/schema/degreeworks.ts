import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { division } from "./websoc.ts";

export type DegreeWorksProgramId = {
  school: "U" | "G";
  programType: "COLLEGE" | "MAJOR" | "MINOR" | "SPEC";
  code: string;
  degreeType?: string;
};

export type DegreeWorksProgram = DegreeWorksProgramId & {
  name: string;
  requirements: DegreeWorksRequirement[];
  /**
   * The set of specializations (if any) that this program has.
   */
  specs: string[];
  specializationRequired: boolean;
};

/**
 * constraint codes we've found in withArray constraints
 * We use a runtime value so zod schema can consume it
 */
export const WithConstraintCode = [
  "DWCREDIT",
  "DWCREDITS",
  "DWTERM",
  "DWLOCATION",
  "DWTITLE",
  "DWGRADETYPE",
  "DWPASSFAIL",
] as const;

export type WithConstraintCode = (typeof WithConstraintCode)[number];

/**
 * Boolean expression tree for per-course constraints (withArray clauses)
 * DegreeWorks serves these in a flat shape for display
 * We parse it into a statement tree for evaluation and downstream use.
 */
export type CourseConstraint = {
  code: WithConstraintCode;
  operator: "<" | "<=" | "=" | ">" | ">=" | "<>";
  valueList: string[];
};

export type CourseConstraintLeaf = CourseConstraint & {
  type: "leaf";
};

export type CourseConstraintNode = {
  type: "AND" | "OR";
  children: CourseConstraintTree[];
};

export type CourseConstraintTree = CourseConstraintLeaf | CourseConstraintNode;

export type DegreeWorksCourseRequirement = {
  requirementType: "Course";
  courseCount: number;
  courses: string[];
  courseConstraints?: Record<string, CourseConstraintTree>;
};

export type DegreeWorksUnitRequirement = {
  requirementType: "Unit";
  unitCount: number;
  courses: string[];
  courseConstraints?: Record<string, CourseConstraintTree>;
};

export type DegreeWorksGroupRequirement = {
  requirementType: "Group";
  requirementCount: number;
  requirements: DegreeWorksRequirement[];
};

export type DegreeWorksMarkerRequirement = {
  requirementType: "Marker";
};

export type DegreeWorksRequirementBase = {
  label: string;
  requirementId: string;
};

export type DegreeWorksRequirement = DegreeWorksRequirementBase &
  (
    | DegreeWorksCourseRequirement
    | DegreeWorksUnitRequirement
    | DegreeWorksGroupRequirement
    | DegreeWorksMarkerRequirement
  );

export const dwDegree = pgTable("dw_degree", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  division: division("division").notNull(),
});

export const dwSchoolRequirement = pgTable(
  "dw_school_requirement",
  {
    id: varchar("id").notNull(),
    catalogYear: varchar("catalog_year").notNull(),
    requirements: jsonb("requirements").$type<DegreeWorksRequirement[]>().notNull(),
  },
  (table) => [uniqueIndex().on(table.id, table.catalogYear)],
);

export const dwMajor = pgTable(
  "dw_major",
  {
    id: varchar("id").primaryKey(),
    degreeId: varchar("degree_id")
      .references(() => dwDegree.id)
      .notNull(),
    code: varchar("code").notNull(),
    name: varchar("name").notNull(),
  },
  (table) => [index().on(table.degreeId)],
);

export const dwMajorSpecializationToRequirement = pgTable(
  "dw_major_specialization_to_requirement",
  {
    majorId: varchar("major_id")
      .notNull()
      .references(() => dwMajor.id),
    specializationId: varchar("specialization_id").references(() => dwSpecialization.id),
    catalogYear: varchar("catalog_year").notNull(),
    requirementId: bigint("requirement_id", { mode: "bigint" })
      .notNull()
      .references(() => dwMajorRequirement.id),
  },
  (table) => [
    unique().on(table.majorId, table.specializationId, table.catalogYear).nullsNotDistinct(),
    index().on(table.catalogYear),
  ],
);

export const dwMajorRequirement = pgTable("dw_major_requirement", {
  id: bigint("id", { mode: "bigint" })
    .primaryKey()
    .generatedAlwaysAs(sql`jsonb_hash_extended(requirements, 0)`),
  requirements: jsonb("requirements").$type<DegreeWorksRequirement[]>().notNull(),
});

export const dwMajorYear = pgTable(
  "dw_major_year",
  {
    programId: varchar("program_id")
      .notNull()
      .references(() => dwMajor.id, { onDelete: "cascade" }),
    catalogYear: varchar("catalog_year").notNull(),
    specializationRequired: boolean("specialization_required").notNull(),
    collegeRequirementsTitle: varchar("college_requirements_title"),
    collegeRequirements: jsonb("college_requirements").$type<DegreeWorksRequirement[]>(),
  },
  (table) => [uniqueIndex().on(table.programId, table.catalogYear), index().on(table.catalogYear)],
);

export const dwMinor = pgTable("dw_minor", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
});

export const dwMinorRequirement = pgTable(
  "dw_minor_requirement",
  {
    programId: varchar("program_id")
      .notNull()
      .references(() => dwMinor.id, { onDelete: "cascade" }),
    catalogYear: varchar("catalog_year").notNull(),
    requirements: jsonb("requirements").$type<DegreeWorksRequirement[]>().notNull(),
  },
  (table) => [uniqueIndex().on(table.programId, table.catalogYear), index().on(table.catalogYear)],
);

export const dwSpecialization = pgTable(
  "dw_specialization",
  {
    id: varchar("id").primaryKey(),
    majorId: varchar("major_id")
      .references(() => dwMajor.id)
      .notNull(),
    name: varchar("name").notNull(),
  },
  (table) => [index().on(table.majorId)],
);

export const dwSpecializationRequirement = pgTable(
  "dw_specialization_requirement",
  {
    programId: varchar("program_id")
      .notNull()
      .references(() => dwSpecialization.id),
    catalogYear: varchar("catalog_year").notNull(),
    requirements: jsonb("requirements").$type<DegreeWorksRequirement[]>().notNull(),
  },
  (table) => [uniqueIndex().on(table.programId, table.catalogYear), index().on(table.catalogYear)],
);
