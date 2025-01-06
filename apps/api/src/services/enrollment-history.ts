import type { enrollmentHistoryQuerySchema, enrollmentHistorySchema } from "$schema";
import type { database } from "@packages/db";
import { and, eq, getTableColumns, inArray } from "@packages/db/drizzle";
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
import type { z } from "zod";

type EnrollmentHistoryServiceInput = z.infer<typeof enrollmentHistoryQuerySchema>;

function buildQuery(input: EnrollmentHistoryServiceInput) {
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
    instructor: typeof websocInstructor.$inferSelect;
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
        instructors: new Set([row.instructor.name]),
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
      section.instructors.add(row.instructor.name);
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

  async getEnrollmentHistory(input: EnrollmentHistoryServiceInput) {
    const sectionRows = await this.db
      .select({
        course: getTableColumns(websocCourse),
        section: getTableColumns(websocSection),
        instructor: getTableColumns(websocInstructor),
        location: getTableColumns(websocLocation),
        meeting: getTableColumns(websocSectionMeeting),
      })
      .from(websocCourse)
      .innerJoin(websocSection, eq(websocCourse.id, websocSection.courseId))
      .innerJoin(
        websocSectionToInstructor,
        eq(websocSection.id, websocSectionToInstructor.sectionId),
      )
      .innerJoin(
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
    const transformedSectionRows = transformSectionRows(sectionRows);
    const enrollmentRows = await this.db
      .select()
      .from(websocSectionEnrollment)
      .where(inArray(websocSectionEnrollment.sectionId, transformedSectionRows.keys().toArray()))
      .orderBy(websocSectionEnrollment.createdAt);
    for (const row of enrollmentRows) {
      const section = transformedSectionRows.get(row.sectionId);
      if (section) {
        section.dates.push(row.createdAt.toISOString().split("T")[0]);
        section.maxCapacityHistory.push(row.maxCapacity.toString(10));
        section.totalEnrolledHistory.push(row.numCurrentlyTotalEnrolled?.toString(10) ?? "");
        section.waitlistHistory.push(row.numOnWaitlist?.toString(10) ?? "");
        section.waitlistCapHistory.push(row.numWaitlistCap?.toString(10) ?? "");
        section.requestedHistory.push(row.numRequested?.toString(10) ?? "");
        section.newOnlyReservedHistory.push(row.numNewOnlyReserved?.toString(10) ?? "");
        section.statusHistory.push(row.status ?? "");
      }
    }
    const filteredSections = Array.from(transformedSectionRows.values()).filter((section) => {
      return (
        section.finalExam.length > 0 ||
        section.maxCapacityHistory.length > 0 ||
        section.totalEnrolledHistory.length > 0 ||
        section.waitlistHistory.length > 0 ||
        section.waitlistCapHistory.length > 0 ||
        section.requestedHistory.length > 0 ||
        section.newOnlyReservedHistory.length > 0 ||
        section.statusHistory.length > 0
      );
    });

    return filteredSections
      .values()
      .map(({ instructors, meetings, ...rest }) => ({
        instructors: Array.from(instructors),
        meetings: meetings.map(({ bldg, ...rest }) => ({ bldg: Array.from(bldg), ...rest })),
        ...rest,
      }))
      .toArray();
  }
}
