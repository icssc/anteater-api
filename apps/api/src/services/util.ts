import type { coursesQuerySchema, websocQuerySchema } from "$schema";
import { type ColumnBaseConfig, type SQL, and, eq, gte, lte, or } from "@packages/db/drizzle";
import type { PgColumn } from "@packages/db/drizzle-pg";
import { websocCourse } from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import type { z } from "zod";

type WebsocServiceInput = z.infer<typeof websocQuerySchema>;

type WebsocGELikeInput = WebsocServiceInput["ge"];
interface WebsocGeLikeTable {
  isGE1A: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE1B: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE2: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE3: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE4: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE5A: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE5B: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE6: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE7: PgColumn<ColumnBaseConfig<"boolean", string>>;
  isGE8: PgColumn<ColumnBaseConfig<"boolean", string>>;
}
export function buildGEQuery(
  table: WebsocGeLikeTable,
  ge: WebsocGELikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (ge) {
    switch (ge) {
      case "GE-1A":
        conditions.push(isTrue(table.isGE1A));
        break;
      case "GE-1B":
        conditions.push(isTrue(table.isGE1B));
        break;
      case "GE-2":
        conditions.push(isTrue(table.isGE2));
        break;
      case "GE-3":
        conditions.push(isTrue(table.isGE3));
        break;
      case "GE-4":
        conditions.push(isTrue(table.isGE4));
        break;
      case "GE-5A":
        conditions.push(isTrue(table.isGE5A));
        break;
      case "GE-5B":
        conditions.push(isTrue(table.isGE5B));
        break;
      case "GE-6":
        conditions.push(isTrue(table.isGE6));
        break;
      case "GE-7":
        conditions.push(isTrue(table.isGE7));
        break;
      case "GE-8":
        conditions.push(isTrue(table.isGE8));
        break;
    }
  }

  return conditions;
}

type WebsocDivisionLikeInput = WebsocServiceInput["division"];
interface CourseNumericLikeTable {
  courseNumeric: PgColumn<ColumnBaseConfig<"number", string>>;
}
export function buildDivisionQuery(
  table: CourseNumericLikeTable,
  division: WebsocDivisionLikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (division) {
    switch (division) {
      case "LowerDiv":
        conditions.push(and(gte(table.courseNumeric, 1), lte(table.courseNumeric, 99)));
        break;
      case "UpperDiv":
        conditions.push(and(gte(table.courseNumeric, 100), lte(table.courseNumeric, 199)));
        break;
      case "Graduate":
        conditions.push(gte(table.courseNumeric, 200));
        break;
    }
  }

  return conditions;
}

type WebsocMultiCourseNumberLikeInput = WebsocServiceInput["courseNumber"];
export function buildMultiCourseNumberQuery(
  courseNumber: WebsocMultiCourseNumberLikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (courseNumber) {
    const courseNumberConditions: Array<SQL | undefined> = [];
    for (const num of courseNumber) {
      switch (num._type) {
        case "ParsedInteger":
          courseNumberConditions.push(eq(websocCourse.courseNumeric, num.value));
          break;
        case "ParsedString":
          courseNumberConditions.push(eq(websocCourse.courseNumber, num.value));
          break;
        case "ParsedRange":
          courseNumberConditions.push(
            and(gte(websocCourse.courseNumeric, num.min), lte(websocCourse.courseNumeric, num.max)),
          );
          break;
      }
    }
    conditions.push(or(...courseNumberConditions));
  }

  return conditions;
}

type WebsocDaysOfWeekLikeInput = WebsocServiceInput["days"];
interface WebsocMeetsLikeTable {
  meetsMonday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsTuesday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsWednesday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsThursday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsFriday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsSaturday: PgColumn<ColumnBaseConfig<"boolean", string>>;
  meetsSunday: PgColumn<ColumnBaseConfig<"boolean", string>>;
}
export function buildDaysOfWeekQuery(
  table: WebsocMeetsLikeTable,
  days: WebsocDaysOfWeekLikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (days) {
    const daysConditions: SQL[] = [];
    for (const day of days) {
      switch (day) {
        case "M":
          daysConditions.push(isTrue(table.meetsMonday));
          break;
        case "Tu":
          daysConditions.push(isTrue(table.meetsTuesday));
          break;
        case "W":
          daysConditions.push(isTrue(table.meetsWednesday));
          break;
        case "Th":
          daysConditions.push(isTrue(table.meetsThursday));
          break;
        case "F":
          daysConditions.push(isTrue(table.meetsFriday));
          break;
        case "S":
          daysConditions.push(isTrue(table.meetsSaturday));
          break;
        case "Su":
          daysConditions.push(isTrue(table.meetsSunday));
          break;
      }
    }
    conditions.push(or(...daysConditions));
  }

  return conditions;
}

type CoursesServiceInput = z.infer<typeof coursesQuerySchema>;

interface CourseUnitsLikeTable {
  minUnits: PgColumn<ColumnBaseConfig<"string", "PgNumeric">>;
  maxUnits: PgColumn<ColumnBaseConfig<"string", "PgNumeric">>;
}

export function buildUnitBoundsQuery(
  table: CourseUnitsLikeTable,
  minUnits: CoursesServiceInput["minUnits"],
  maxUnits: CoursesServiceInput["maxUnits"],
): Array<SQL | undefined> {
  const conditions = [];

  if (minUnits) {
    conditions.push(gte(table.minUnits, minUnits.toString(10)));
  }
  if (maxUnits) {
    conditions.push(lte(table.maxUnits, maxUnits.toString(10)));
  }

  return conditions;
}
