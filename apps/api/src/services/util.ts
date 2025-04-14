import { type SQL, and, gte, lte } from "@packages/db/drizzle";
import { websocCourse } from "@packages/db/schema";
import { isTrue } from "@packages/db/utils";
import type { WebsocServiceInput } from "./websoc.ts";

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
