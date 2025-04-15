import type { websocQuerySchema, websocResponseSchema, websocSectionSchema } from "$schema";
import type { database } from "@packages/db";
import type { SQL } from "@packages/db/drizzle";
import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
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
  if (input.department) {
    conditions.push(eq(websocDepartment.deptCode, input.department));
  }
  if (input.courseTitle) {
    conditions.push(eq(websocCourse.courseTitle, input.courseTitle));
  }
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
  if (input.days) {
    const daysConditions: SQL[] = [];
    for (const day of input.days) {
      switch (day) {
        case "M":
          daysConditions.push(isTrue(websocSectionMeeting.meetsMonday));
          break;
        case "Tu":
          daysConditions.push(isTrue(websocSectionMeeting.meetsTuesday));
          break;
        case "W":
          daysConditions.push(isTrue(websocSectionMeeting.meetsWednesday));
          break;
        case "Th":
          daysConditions.push(isTrue(websocSectionMeeting.meetsThursday));
          break;
        case "F":
          daysConditions.push(isTrue(websocSectionMeeting.meetsFriday));
          break;
        case "S":
          daysConditions.push(isTrue(websocSectionMeeting.meetsSaturday));
          break;
        case "Su":
          daysConditions.push(isTrue(websocSectionMeeting.meetsSunday));
          break;
      }
    }
    conditions.push(or(...daysConditions));
  }
  if (input.building) {
    conditions.push(eq(websocLocation.building, input.building.toUpperCase()));
  }
  if (input.room) {
    conditions.push(eq(websocLocation.room, input.room.toUpperCase()));
  }
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

  async getWebsocResponse(input: WebsocServiceInput) {
    if (input.includeRelatedCourses) {
      const sub = this.db
        .select({ courseId: websocCourse.id })
        .from(websocSchool)
        .innerJoin(websocDepartment, eq(websocSchool.id, websocDepartment.schoolId))
        .innerJoin(websocCourse, eq(websocDepartment.id, websocCourse.departmentId))
        .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
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
        .leftJoin(websocLocation, eq(websocLocation.id, websocSectionMeetingToLocation.locationId))
        .where(buildQuery(input));

      return this.db
        .select({
          school: getTableColumns(websocSchool),
          department: getTableColumns(websocDepartment),
          course: getTableColumns(websocCourse),
          section: getTableColumns(websocSection),
        })
        .from(websocSchool)
        .innerJoin(websocDepartment, eq(websocSchool.id, websocDepartment.schoolId))
        .innerJoin(websocCourse, eq(websocDepartment.id, websocCourse.departmentId))
        .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
        .where(inArray(websocCourse.id, sub))
        .then(transformRows);
    }

    return this.db
      .select({
        school: getTableColumns(websocSchool),
        department: getTableColumns(websocDepartment),
        course: getTableColumns(websocCourse),
        section: getTableColumns(websocSection),
      })
      .from(websocSchool)
      .innerJoin(websocDepartment, eq(websocSchool.id, websocDepartment.schoolId))
      .innerJoin(websocCourse, eq(websocDepartment.id, websocCourse.departmentId))
      .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
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
      .leftJoin(websocLocation, eq(websocLocation.id, websocSectionMeetingToLocation.locationId))
      .where(buildQuery(input))
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
}
