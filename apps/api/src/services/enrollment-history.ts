import type { database } from "@packages/db";
import { and, desc, eq, getTableColumns, gte, inArray, lte, sql } from "@packages/db/drizzle";
import {
  websocCourse,
  websocInstructor,
  websocLocation,
  websocSection,
  websocSectionEnrollment,
  websocSectionMeeting,
  websocSectionMeetingToLocation,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { getFromMapOrThrow } from "@packages/stdlib";
import type { z } from "zod";
import type {
  enrollmentHistoryGranularQuerySchema,
  enrollmentHistoryGranularSchema,
  enrollmentHistoryQuerySchema,
  enrollmentHistorySchema,
} from "$schema";

type EnrollmentHistoryServiceInput = z.infer<typeof enrollmentHistoryQuerySchema>;
type EnrollmentHistoryGranularServiceInput = z.infer<typeof enrollmentHistoryGranularQuerySchema>;

function buildQuery(input: EnrollmentHistoryServiceInput | EnrollmentHistoryGranularServiceInput) {
  const conditions = [];
  if (input.year) {
    conditions.push(eq(websocCourse.year, input.year));
  }
  if (input.quarter) {
    conditions.push(eq(websocCourse.quarter, input.quarter));
  }
  if (input.instructorName) {
    conditions.push(eq(websocInstructor.name, input.instructorName));
  }
  if (input.department) {
    conditions.push(eq(websocCourse.deptCode, input.department));
  }
  if (input.courseNumber) {
    conditions.push(eq(websocCourse.courseNumber, input.courseNumber));
  }
  if (input.sectionCode) {
    conditions.push(eq(websocSection.sectionCode, input.sectionCode));
  }
  if (input.sectionType) {
    conditions.push(eq(websocSection.sectionType, input.sectionType));
  }
  return and(...conditions);
}

function transformSectionRows(
  rows: {
    course: typeof websocCourse.$inferSelect;
    section: typeof websocSection.$inferSelect;
    meeting: typeof websocSectionMeeting.$inferSelect;
    location: typeof websocLocation.$inferSelect;
  }[],
) {
  const mapping = new Map<
    string,
    Omit<z.infer<typeof enrollmentHistorySchema>, "instructors" | "meetings"> & {
      instructors: Set<string>;
      meetings: {
        bldg: Set<string>;
        days: string;
        time: string;
      }[];
    }
  >();
  for (const row of rows) {
    if (!mapping.has(row.section.id)) {
      mapping.set(row.section.id, {
        year: row.section.year,
        quarter: row.section.quarter,
        sectionCode: row.section.sectionCode.toString(10).padStart(5, "0"),
        department: row.course.deptCode,
        courseNumber: row.course.courseNumber,
        sectionType: row.section.sectionType,
        sectionNum: row.section.sectionNum,
        units: row.section.units,
        instructors: new Set(row.section.instructors),
        meetings: [
          {
            bldg: new Set([`${row.location.building} ${row.location.room}`]),
            days: row.meeting.daysString,
            time: row.meeting.timeString,
          },
        ],
        finalExam: row.section.finalExamString,
        dates: [],
        maxCapacityHistory: [],
        totalEnrolledHistory: [],
        waitlistHistory: [],
        waitlistCapHistory: [],
        requestedHistory: [],
        newOnlyReservedHistory: [],
        statusHistory: [],
      });
      continue;
    }
    const section = mapping.get(row.section.id);
    if (section) {
      if (!section.meetings[row.meeting.meetingIndex]) {
        section.meetings[row.meeting.meetingIndex] = {
          bldg: new Set([`${row.location.building} ${row.location.room}`]),
          days: row.meeting.daysString,
          time: row.meeting.timeString,
        };
      } else {
        section.meetings[row.meeting.meetingIndex].bldg.add(
          `${row.location.building} ${row.location.room}`,
        );
      }
    }
  }
  return mapping;
}

export class EnrollmentHistoryService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  private async fetchSectionRows(
    input: EnrollmentHistoryServiceInput | EnrollmentHistoryGranularServiceInput,
  ) {
    return this.db
      .select({
        course: getTableColumns(websocCourse),
        section: getTableColumns(websocSection),
        instructor: getTableColumns(websocInstructor),
        location: getTableColumns(websocLocation),
        meeting: getTableColumns(websocSectionMeeting),
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .leftJoin(
        websocInstructor,
        eq(websocSectionToInstructor.instructorName, websocInstructor.name),
      )
      .innerJoin(websocSectionMeeting, eq(websocSection.id, websocSectionMeeting.sectionId))
      .innerJoin(
        websocSectionMeetingToLocation,
        eq(websocSectionMeeting.id, websocSectionMeetingToLocation.meetingId),
      )
      .innerJoin(websocLocation, eq(websocLocation.id, websocSectionMeetingToLocation.locationId))
      .where(buildQuery(input));
  }

  async getEnrollmentHistory(input: EnrollmentHistoryServiceInput) {
    const sectionRows = await this.fetchSectionRows(input);
    const transformedSectionRows = transformSectionRows(sectionRows);
    const enrollmentRows = await this.db
      .selectDistinctOn(
        [websocSectionEnrollment.sectionId, sql`DATE(${websocSectionEnrollment.createdAt})`],
        getTableColumns(websocSectionEnrollment),
      )
      .from(websocSectionEnrollment)
      .innerJoin(websocSection, eq(websocSection.id, websocSectionEnrollment.sectionId))
      .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
      .leftJoin(
        websocSectionToInstructor,
        eq(websocSectionToInstructor.sectionId, websocSection.id),
      )
      .leftJoin(
        websocInstructor,
        eq(websocInstructor.name, websocSectionToInstructor.instructorName),
      )
      .where(buildQuery(input))
      .orderBy(
        websocSectionEnrollment.sectionId,
        sql`DATE(${websocSectionEnrollment.createdAt})`,
        desc(websocSectionEnrollment.createdAt),
      );
    for (const row of enrollmentRows) {
      const section = getFromMapOrThrow(transformedSectionRows, row.sectionId);
      section.dates.push(row.createdAt.toISOString().split("T")[0]);
      section.maxCapacityHistory.push(row.maxCapacity.toString(10));
      section.totalEnrolledHistory.push(row.numCurrentlyTotalEnrolled?.toString(10) ?? "");
      section.waitlistHistory.push(row.numOnWaitlist?.toString(10) ?? "");
      section.waitlistCapHistory.push(row.numWaitlistCap?.toString(10) ?? "");
      section.requestedHistory.push(row.numRequested?.toString(10) ?? "");
      section.newOnlyReservedHistory.push(row.numNewOnlyReserved?.toString(10) ?? "");
      section.statusHistory.push(row.status ?? "");
    }
    const filteredSections = transformedSectionRows.values().filter((section) => {
      return section.dates.length > 0;
    });

    return filteredSections
      .map(({ instructors, meetings, ...rest }) => ({
        instructors: Array.from(instructors),
        meetings: meetings.map(({ bldg, ...rest }) => ({ bldg: Array.from(bldg), ...rest })),
        ...rest,
      }))
      .toArray();
  }

  async getEnrollmentHistoryGranular(input: EnrollmentHistoryGranularServiceInput) {
    const sectionRows = await this.fetchSectionRows(input);
    const transformedSectionRows = transformSectionRows(sectionRows);
    const enrollmentConditions = [
      inArray(websocSectionEnrollment.sectionId, transformedSectionRows.keys().toArray()),
    ];
    if (input.from) {
      enrollmentConditions.push(gte(websocSectionEnrollment.createdAt, new Date(input.from)));
    }
    if (input.to) {
      enrollmentConditions.push(lte(websocSectionEnrollment.createdAt, new Date(input.to)));
    }
    const enrollmentRows = await this.db
      .select()
      .from(websocSectionEnrollment)
      .where(and(...enrollmentConditions))
      .orderBy(websocSectionEnrollment.createdAt);
    const granularMapping = new Map<string, z.infer<typeof enrollmentHistoryGranularSchema>>();
    for (const [sectionId, section] of transformedSectionRows) {
      granularMapping.set(sectionId, {
        year: section.year,
        quarter: section.quarter,
        sectionCode: section.sectionCode,
        snapshots: [],
      });
    }
    for (const row of enrollmentRows) {
      const section = getFromMapOrThrow(granularMapping, row.sectionId);
      section.snapshots.push({
        timestamp: row.createdAt.toISOString(),
        maxCapacity: row.maxCapacity,
        totalEnrolled: row.numCurrentlyTotalEnrolled ?? null,
        waitlist: row.numOnWaitlist ?? null,
        waitlistCap: row.numWaitlistCap ?? null,
        requested: row.numRequested ?? null,
        newOnlyReserved: row.numNewOnlyReserved ?? null,
        status: row.status ?? "",
      });
    }
    return Array.from(granularMapping.values()).filter((s) => s.snapshots.length > 0);
  }
}
