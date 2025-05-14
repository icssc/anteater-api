import type { websocQuerySchema } from "$schema";
import { type ColumnBaseConfig, type SQL, and, eq, gte, lte, or } from "@packages/db/drizzle";
import type { PgColumn } from "@packages/db/drizzle-pg";
import { websocCourse } from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import type { z } from "zod";

type WebsocServiceInput = z.infer<typeof websocQuerySchema>;

type WebsocGELikeInput = Pick<WebsocServiceInput, "ge">;
export function buildGEQuery(input: WebsocGELikeInput): Array<SQL | undefined> {
  const conditions = [];

  if (input.ge) {
    switch (input.ge) {
      case "GE-1A":
        conditions.push(isTrue(websocCourse.isGE1A));
        break;
      case "GE-1B":
        conditions.push(isTrue(websocCourse.isGE1B));
        break;
      case "GE-2":
        conditions.push(isTrue(websocCourse.isGE2));
        break;
      case "GE-3":
        conditions.push(isTrue(websocCourse.isGE3));
        break;
      case "GE-4":
        conditions.push(isTrue(websocCourse.isGE4));
        break;
      case "GE-5A":
        conditions.push(isTrue(websocCourse.isGE5A));
        break;
      case "GE-5B":
        conditions.push(isTrue(websocCourse.isGE5B));
        break;
      case "GE-6":
        conditions.push(isTrue(websocCourse.isGE6));
        break;
      case "GE-7":
        conditions.push(isTrue(websocCourse.isGE7));
        break;
      case "GE-8":
        conditions.push(isTrue(websocCourse.isGE8));
        break;
    }
  }

  return conditions;
}

type WebsocDivisionLikeInput = Pick<WebsocServiceInput, "division">;
export function buildDivisionQuery(input: WebsocDivisionLikeInput): Array<SQL | undefined> {
  const conditions = [];

  if (input.division) {
    switch (input.division) {
      case "LowerDiv":
        conditions.push(
          and(gte(websocCourse.courseNumeric, 1), lte(websocCourse.courseNumeric, 99)),
        );
        break;
      case "UpperDiv":
        conditions.push(
          and(gte(websocCourse.courseNumeric, 100), lte(websocCourse.courseNumeric, 199)),
        );
        break;
      case "Graduate":
        conditions.push(gte(websocCourse.courseNumeric, 200));
        break;
    }
  }

  return conditions;
}

type WebsocMultiCourseNumberLikeInput = Pick<WebsocServiceInput, "courseNumber">;
export function buildMultiCourseNumberQuery(
  input: WebsocMultiCourseNumberLikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (input.courseNumber) {
    const courseNumberConditions: Array<SQL | undefined> = [];
    for (const num of input.courseNumber) {
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

type WebsocDaysOfWeekLikeInput = Pick<WebsocServiceInput, "days">;
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
  input: WebsocDaysOfWeekLikeInput,
): Array<SQL | undefined> {
  const conditions = [];

  if (input.days) {
    const daysConditions: SQL[] = [];
    for (const day of input.days) {
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
