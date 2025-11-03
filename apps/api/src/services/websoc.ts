import type {
  websocDepartmentsQuerySchema,
  websocQuerySchema,
  websocResponseSchema,
  websocSectionSchema,
} from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  like,
  lte,
  ne,
  or,
} from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import {
  websocCourse,
  websocDepartment,
  websocInstructor,
  websocLocation,
  websocSchool,
  websocSection,
  websocSectionMeeting,
  websocSectionMeetingToLocation,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { isFalse, isTrue } from "@packages/db/utils";
import { negativeAsNull } from "@packages/stdlib";
import type { z } from "zod";
import {
  buildDaysOfWeekQuery,
  buildDivisionQuery,
  buildGEQuery,
  buildMultiCourseNumberQuery,
} from "./util.ts";

const termOrder = {
  Winter: 0,
  Spring: 1,
  Summer1: 2,
  Summer10wk: 3,
  Summer2: 4,
  Fall: 5,
};

type WebsocServiceInput = z.infer<typeof websocQuerySchema>;

function buildQuery(input: WebsocServiceInput) {
  const conditions = [
    and(eq(websocSchool.year, input.year), eq(websocSchool.quarter, input.quarter)),
  ];
  conditions.push(...buildGEQuery(websocCourse, input.ge));
  if (input.department) {
    conditions.push(eq(websocDepartment.deptCode, input.department));
  }
  if (input.courseTitle) {
    conditions.push(eq(websocCourse.courseTitle, input.courseTitle));
  }
  conditions.push(...buildMultiCourseNumberQuery(input.courseNumber));
  if (input.sectionCodes) {
    const sectionCodesConditions: Array<SQL | undefined> = [];
    for (const code of input.sectionCodes) {
      switch (code._type) {
        case "ParsedInteger":
          sectionCodesConditions.push(eq(websocSection.sectionCode, code.value));
          break;
        case "ParsedRange":
          sectionCodesConditions.push(
            and(gte(websocSection.sectionCode, code.min), lte(websocSection.sectionCode, code.max)),
          );
          break;
      }
    }
    conditions.push(or(...sectionCodesConditions));
  }
  if (input.instructorName) {
    conditions.push(ilike(websocInstructor.name, `${input.instructorName}%`));
  }
  conditions.push(...buildDaysOfWeekQuery(websocSectionMeeting, input.days));
  if (input.building) {
    conditions.push(eq(websocLocation.building, input.building.toUpperCase()));
  }
  if (input.room) {
    conditions.push(eq(websocLocation.room, input.room.toUpperCase()));
  }
  conditions.push(...buildDivisionQuery(websocCourse, input.division));
  if (input.sectionType) {
    conditions.push(eq(websocSection.sectionType, input.sectionType));
  }
  if (input.fullCourses) {
    switch (input.fullCourses) {
      case "SkipFull":
        conditions.push(ne(websocSection.status, "FULL"));
        break;
      case "SkipFullWaitlist":
        conditions.push(and(ne(websocSection.status, "FULL"), ne(websocSection.status, "Waitl")));
        break;
      case "FullOnly":
        conditions.push(or(eq(websocSection.status, "FULL"), eq(websocSection.status, "Waitl")));
        break;
      case "Overenrolled":
        conditions.push(
          or(
            gt(websocSection.numCurrentlySectionEnrolled, websocSection.maxCapacity),
            gt(websocSection.numCurrentlyTotalEnrolled, websocSection.maxCapacity),
          ),
        );
        break;
    }
  }
  if (input.cancelledCourses) {
    switch (input.cancelledCourses) {
      case "Exclude":
        conditions.push(isFalse(websocSection.isCancelled));
        break;
      case "Include":
        break;
      case "Only":
        conditions.push(isTrue(websocSection.isCancelled));
        break;
    }
  }
  if (input.units) {
    if (input.units === "VAR") {
      conditions.push(like(websocSection.units, "%-%"));
    } else {
      conditions.push(eq(websocSection.units, input.units));
    }
  }
  if (input.startTime) {
    conditions.push(gte(websocSectionMeeting.startTime, input.startTime));
  }
  if (input.endTime) {
    conditions.push(lte(websocSectionMeeting.endTime, input.endTime));
  }
  if (input.excludeRestrictionCodes) {
    for (const code of input.excludeRestrictionCodes) {
      switch (code) {
        case "A":
          conditions.push(isFalse(websocSection.restrictionA));
          break;
        case "B":
          conditions.push(isFalse(websocSection.restrictionB));
          break;
        case "C":
          conditions.push(isFalse(websocSection.restrictionC));
          break;
        case "D":
          conditions.push(isFalse(websocSection.restrictionD));
          break;
        case "E":
          conditions.push(isFalse(websocSection.restrictionE));
          break;
        case "F":
          conditions.push(isFalse(websocSection.restrictionF));
          break;
        case "G":
          conditions.push(isFalse(websocSection.restrictionG));
          break;
        case "H":
          conditions.push(isFalse(websocSection.restrictionH));
          break;
        case "I":
          conditions.push(isFalse(websocSection.restrictionI));
          break;
        case "J":
          conditions.push(isFalse(websocSection.restrictionJ));
          break;
        case "K":
          conditions.push(isFalse(websocSection.restrictionK));
          break;
        case "L":
          conditions.push(isFalse(websocSection.restrictionL));
          break;
        case "M":
          conditions.push(isFalse(websocSection.restrictionM));
          break;
        case "N":
          conditions.push(isFalse(websocSection.restrictionN));
          break;
        case "O":
          conditions.push(isFalse(websocSection.restrictionO));
          break;
        case "S":
          conditions.push(isFalse(websocSection.restrictionS));
          break;
        case "R":
          conditions.push(isFalse(websocSection.restrictionR));
          break;
        case "X":
          conditions.push(isFalse(websocSection.restrictionX));
          break;
      }
    }
  }
  return and(...conditions);
}

type Row = {
  school: typeof websocSchool.$inferSelect;
  department: typeof websocDepartment.$inferSelect;
  course: typeof websocCourse.$inferSelect;
  section: typeof websocSection.$inferSelect;
};

const transformSection = (section: Row["section"]): z.infer<typeof websocSectionSchema> => {
  // as described in websoc-scraper, there are non-null values which should also be interpreted as null
  return {
    ...section,
    sectionCode: section.sectionCode.toString(10).padStart(5, "0"),
    status: section.status ?? "",
    maxCapacity: section.maxCapacity.toString(10),
    numCurrentlyEnrolled: {
      totalEnrolled: negativeAsNull(section.numCurrentlyTotalEnrolled)?.toString(10) ?? "",
      sectionEnrolled: negativeAsNull(section.numCurrentlySectionEnrolled)?.toString(10) ?? "",
    },
    numNewOnlyReserved: negativeAsNull(section.numNewOnlyReserved)?.toString(10) ?? "",
    numOnWaitlist: negativeAsNull(section.numOnWaitlist)?.toString(10) ?? "",
    numRequested: section.numRequested?.toString(10) ?? "",
    numWaitlistCap: negativeAsNull(section.numWaitlistCap)?.toString(10) ?? "",
  };
};

function transformRows(rows: Row[]): z.infer<typeof websocResponseSchema> {
  const schools = rows
    .map((row) => row.school)
    .reduce(
      (acc, school) => acc.set(school.id, { ...school, departments: [] }),
      new Map<
        string,
        Row["school"] & {
          departments: Array<
            Row["department"] & { courses: Array<Row["course"] & { sections: Row["section"][] }> }
          >;
        }
      >(),
    );
  const departments = rows
    .map((row) => row.department)
    .reduce(
      (acc, dept) => acc.set(dept.id, { ...dept, courses: [] }),
      new Map<
        string,
        Row["department"] & { courses: Array<Row["course"] & { sections: Row["section"][] }> }
      >(),
    );
  const courses = rows
    .map((row) => row.course)
    .reduce(
      (acc, course) => acc.set(course.id, { ...course, sections: [] }),
      new Map<string, Row["course"] & { sections: Row["section"][] }>(),
    );
  const sections = rows
    .map((row) => row.section)
    .reduce((acc, section) => acc.set(section.id, section), new Map<string, Row["section"]>());
  for (const section of sections.values()) {
    courses.get(section.courseId)?.sections.push(section);
  }
  for (const course of courses.values()) {
    departments.get(course.departmentId)?.courses.push(course);
  }
  for (const department of departments.values()) {
    schools.get(department.schoolId)?.departments.push(department);
  }
  return {
    schools: schools
      .values()
      .map((school) => ({
        ...school,
        departments: school.departments.map((department) => ({
          ...department,
          courses: department.courses.map((course) => ({
            ...course,
            sections: course.sections.map(transformSection),
          })),
        })),
      }))
      .toArray(),
  };
}

function transformTerm(term: { year: string; quarter: Term }) {
  const { year, quarter } = term;
  let longQtr: string;
  switch (quarter) {
    case "Fall":
      longQtr = "Fall Quarter";
      break;
    case "Winter":
      longQtr = "Winter Quarter";
      break;
    case "Spring":
      longQtr = "Spring Quarter";
      break;
    case "Summer1":
      longQtr = "Summer Session 1";
      break;
    case "Summer10wk":
      longQtr = "10-wk Summer";
      break;
    case "Summer2":
      longQtr = "Summer Session 2";
      break;
  }
  return { shortName: `${year} ${quarter}`, longName: `${year} ${longQtr}` };
}

export class WebsocService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  makeSelect(
    selection: Parameters<ReturnType<typeof database>["select"]>[0],
    includeFilterTables?: boolean,
  ) {
    const base = this.db
      .select(selection)
      .from(websocSchool)
      .innerJoin(websocDepartment, eq(websocSchool.id, websocDepartment.schoolId))
      .innerJoin(websocCourse, eq(websocDepartment.id, websocCourse.departmentId))
      .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId));

    if (!includeFilterTables) {
      return base;
    }

    return base
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .leftJoin(
        websocInstructor,
        eq(websocSectionToInstructor.instructorName, websocInstructor.name),
      )
      .leftJoin(websocSectionMeeting, eq(websocSection.id, websocSectionMeeting.sectionId))
      .leftJoin(
        websocSectionMeetingToLocation,
        eq(websocSectionMeeting.id, websocSectionMeetingToLocation.meetingId),
      )
      .leftJoin(websocLocation, eq(websocLocation.id, websocSectionMeetingToLocation.locationId));
  }

  async getWebsocResponse(input: WebsocServiceInput) {
    // final selection of actual data we need to process on our end
    const selectionToReturn = {
      school: getTableColumns(websocSchool),
      department: getTableColumns(websocDepartment),
      course: getTableColumns(websocCourse),
      section: getTableColumns(websocSection),
    };

    if (input.includeRelatedCourses) {
      // pull only the course IDs; don't need any data from subquery
      const sub = this.makeSelect({ courseId: websocCourse.id }, true)
        .where(buildQuery(input))
        .limit(1000)
        .as("sub");

      return this.makeSelect(selectionToReturn, false)
        .rightJoin(sub, eq(websocCourse.id, sub.courseId))
        .then((rows) => rows as Row[])
        .then(transformRows);
    }

    return this.makeSelect(selectionToReturn, true)
      .where(buildQuery(input))
      .then((rows) => rows as Row[])
      .then(transformRows);
  }

  async getAllTerms() {
    return this.db
      .select({ year: websocSchool.year, quarter: websocSchool.quarter })
      .from(websocSchool)
      .then((rows) =>
        new Map(rows.map((row) => [`${row.year} ${row.quarter}`, row]))
          .values()
          .toArray()
          .sort(({ year: y1, quarter: q1 }, { year: y2, quarter: q2 }) =>
            y1 === y2
              ? termOrder[q1] - termOrder[q2]
              : Number.parseInt(y1, 10) - Number.parseInt(y2, 10),
          )
          .reverse()
          .map(transformTerm),
      );
  }

  async getDepartments(input: z.infer<typeof websocDepartmentsQuerySchema>) {
    const options = [];
    if (input.sinceYear) {
      if (input.sinceQuarter) {
        // if quarter specified, only quarters not later than that one are okay
        for (const [term, order] of Object.entries(termOrder)) {
          if (order >= termOrder[input.sinceQuarter]) {
            options.push(
              and(
                eq(websocDepartment.year, input.sinceYear),
                eq(websocDepartment.quarter, term as Term),
              ),
            );
          }
        }
      } else {
        // if quarter not specified, any quarter that year is okay
        options.push(eq(websocDepartment.year, input.sinceYear));
      }
      // in either case, all years after sinceYear are okay
      options.push(gt(websocDepartment.year, input.sinceYear));
    }

    return this.db
      .selectDistinctOn([websocDepartment.deptCode], {
        deptCode: websocDepartment.deptCode,
        deptName: websocDepartment.deptName,
      })
      .from(websocDepartment)
      .where(or(...options))
      .orderBy(websocDepartment.deptCode, desc(websocDepartment.year));
  }
}
