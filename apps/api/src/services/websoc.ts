import type { database } from "@packages/db";
import type { SQL, SQLWrapper } from "@packages/db/drizzle";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
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
import { isFalse, isTrue, websocTermSortOrder } from "@packages/db/utils";
import { negativeAsNull } from "@packages/stdlib";
import type { z } from "zod";
import type {
  syllabiQuerySchema,
  websocDepartmentsQuerySchema,
  websocQuerySchema,
  websocResponseSchema,
  websocSectionSchema,
} from "$schema";
import {
  buildCourseLevelQuery,
  buildDaysOfWeekQuery,
  buildGEQuery,
  buildMultiCourseNumberQuery,
} from "./util.ts";

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
  if (input.courseId) {
    conditions.push(eq(websocCourse.courseId, input.courseId));
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
  conditions.push(...buildCourseLevelQuery(websocCourse, input.division));
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

type JoinedRow = {
  school: typeof websocSchool.$inferSelect;
  department: typeof websocDepartment.$inferSelect;
  course: typeof websocCourse.$inferSelect;
  section: typeof websocSection.$inferSelect;
};

type CourseNode = JoinedRow["course"] & { sections: z.infer<typeof websocSectionSchema>[] };
type DepartmentNode = JoinedRow["department"] & { courses: CourseNode[] };
type SchoolNode = JoinedRow["school"] & { departments: DepartmentNode[] };

const transformSection = (section: JoinedRow["section"]): z.infer<typeof websocSectionSchema> => {
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

  transformJoinedRows(rows: JoinedRow[]): z.infer<typeof websocResponseSchema> {
    const schools = rows
      .map((row) => row.school)
      .reduce(
        (acc, school) => acc.set(school.id, { ...school, departments: [] }),
        new Map<
          string,
          JoinedRow["school"] & {
            departments: Array<
              JoinedRow["department"] & {
                courses: Array<JoinedRow["course"] & { sections: JoinedRow["section"][] }>;
              }
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
          JoinedRow["department"] & {
            courses: Array<JoinedRow["course"] & { sections: JoinedRow["section"][] }>;
          }
        >(),
      );
    const courses = rows
      .map((row) => row.course)
      .reduce(
        (acc, course) => acc.set(course.id, { ...course, sections: [] }),
        new Map<string, JoinedRow["course"] & { sections: JoinedRow["section"][] }>(),
      );
    const sections = rows
      .map((row) => row.section)
      .reduce(
        (acc, section) => acc.set(section.id, section),
        new Map<string, JoinedRow["section"]>(),
      );

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

  async buildFromRequeries(sectionIds: string[]) {
    const sections = await this.db
      .select()
      .from(websocSection)
      .where(inArray(websocSection.id, sectionIds));
    const courseIds = [...new Set(sections.map((section) => section.courseId))];
    const courses = await this.db
      .select()
      .from(websocCourse)
      .where(inArray(websocCourse.id, courseIds));
    const departmentIds = [...new Set(courses.map((course) => course.departmentId))];

    // small enough to do together; avoid one more round trip
    const departmentsAndSchools = await this.db
      .select({
        department: getTableColumns(websocDepartment),
        school: getTableColumns(websocSchool),
      })
      .from(websocDepartment)
      .innerJoin(websocSchool, eq(websocDepartment.schoolId, websocSchool.id))
      .where(inArray(websocDepartment.id, departmentIds));

    const schools: SchoolNode[] = [];
    const schoolById = new Map<string, SchoolNode>();
    const departmentById = new Map<string, DepartmentNode>();

    for (const { department, school } of departmentsAndSchools) {
      const departmentNode: DepartmentNode = { ...department, courses: [] };
      departmentById.set(department.id, departmentNode);

      if (!schoolById.has(school.id)) {
        const schoolNode: SchoolNode = { ...school, departments: [departmentNode] };
        schools.push(schoolNode);
        schoolById.set(school.id, schoolNode);
      } else {
        // just checked for inclusion
        (schoolById.get(school.id) as SchoolNode).departments.push(departmentNode);
      }
    }

    const courseById = new Map<string, CourseNode>();
    for (const course of courses) {
      const node: CourseNode = { ...course, sections: [] };
      courseById.set(course.id, node);
      departmentById.get(course.departmentId)?.courses.push(node);
    }

    for (const section of sections) {
      courseById.get(section.courseId)?.sections.push(transformSection(section));
    }

    return { schools };
  }

  async getWebsocResponse(
    input: WebsocServiceInput,
  ): Promise<z.infer<typeof websocResponseSchema>> {
    let matchingSectionRows: { sectionId: string }[] = [];

    if (input.includeRelatedCourses) {
      // pull only the course IDs; don't need any data from subquery
      const sub = this.makeSelect({ courseId: websocCourse.id }, true)
        .where(buildQuery(input))
        .limit(1000)
        .as("sub");

      matchingSectionRows = await this.makeSelect({ sectionId: websocSection.id }, false)
        .rightJoin(sub, eq(websocCourse.id, sub.courseId))
        .then((rows) => rows as { sectionId: string }[]);
    } else {
      matchingSectionRows = await this.makeSelect({ sectionId: websocSection.id }, true)
        .where(buildQuery(input))
        .then((row) => row as { sectionId: string }[]);
    }

    const sectionIds = matchingSectionRows.map(({ sectionId }) => sectionId);
    if (sectionIds.length === 0) {
      return { schools: [] };
    }

    if (sectionIds.length > 1000) {
      // we sometimes OOM on big (e.g. entire term) requests...
      // do multiple queries to avoid thousands of copies of dept/school object coming from sql and being gc'd too slowly
      return this.buildFromRequeries(sectionIds);
    } else {
      // when set is small enough, short round-trip time is preferable for slightly higher memory
      // and this set is small enough to never OOM
      return this.makeSelect(
        {
          school: getTableColumns(websocSchool),
          department: getTableColumns(websocDepartment),
          course: getTableColumns(websocCourse),
          section: getTableColumns(websocSection),
        },
        true,
      )
        .where(buildQuery(input))
        .then((rows) => rows as JoinedRow[])
        .then(this.transformJoinedRows);
    }
  }

  async getAllTerms() {
    return this.db
      .select({ year: websocSchool.year, quarter: websocSchool.quarter })
      .from(websocSchool)
      .groupBy(websocSchool.year, websocSchool.quarter)
      .orderBy(desc(websocSchool.year), desc(websocTermSortOrder(websocSchool.quarter)))
      .then((rows) => rows.map(transformTerm));
  }

  async getDepartments(input: z.infer<typeof websocDepartmentsQuerySchema>) {
    const sinceOptions = [] as (SQLWrapper | undefined)[];
    const untilOptions = [] as (SQLWrapper | undefined)[];

    if (input.sinceYear) {
      if (!input.sinceQuarter) {
        sinceOptions.push(eq(websocDepartment.year, input.sinceYear));
      } else {
        sinceOptions.push(
          and(
            eq(websocDepartment.year, input.sinceYear),
            gte(
              websocTermSortOrder(websocDepartment.quarter),
              websocTermSortOrder(input.sinceQuarter),
            ),
          ),
        );
      }
      sinceOptions.push(gt(websocDepartment.year, input.sinceYear));
    }

    if (input.untilYear) {
      if (!input.untilQuarter) {
        untilOptions.push(eq(websocDepartment.year, input.untilYear));
      } else {
        untilOptions.push(
          and(
            eq(websocDepartment.year, input.untilYear),
            lte(
              websocTermSortOrder(websocDepartment.quarter),
              websocTermSortOrder(input.untilQuarter),
            ),
          ),
        );
      }
      untilOptions.push(lt(websocDepartment.year, input.untilYear));
    }
    return this.db
      .selectDistinctOn([websocDepartment.deptCode], {
        deptCode: websocDepartment.deptCode,
        deptName: websocDepartment.deptName,
      })
      .from(websocDepartment)
      .where(and(or(...sinceOptions), or(...untilOptions)))
      .orderBy(websocDepartment.deptCode, desc(websocDepartment.year));
  }

  async getSyllabi(input: z.infer<typeof syllabiQuerySchema>) {
    const conditions = [eq(websocCourse.courseId, input.courseId), ne(websocSection.webURL, "")];
    if (input.year) {
      conditions.push(eq(websocSection.year, input.year));
    }
    if (input.quarter) {
      conditions.push(eq(websocSection.quarter, input.quarter));
    }
    if (input.instructor) {
      conditions.push(eq(websocSectionToInstructor.instructorName, input.instructor));
    }
    return this.db
      .select({
        year: websocSection.year,
        quarter: websocSection.quarter,
        url: websocSection.webURL,
        instructorNames: sql<
          string[]
        >`ARRAY_REMOVE(ARRAY_AGG(DISTINCT ${websocSectionToInstructor.instructorName}), NULL)`,
      })
      .from(websocSection)
      .innerJoin(websocCourse, eq(websocSection.courseId, websocCourse.id))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.sectionId, websocSection.id),
      )
      .where(and(...conditions))
      .groupBy(websocSection.year, websocSection.quarter, websocSection.webURL)
      .orderBy(desc(websocSection.year), desc(websocTermSortOrder(websocSection.quarter)));
  }
}
