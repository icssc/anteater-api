import type { database } from "@packages/db";
import { and, eq, getTableColumns, gte, lte, sql } from "@packages/db/drizzle";
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
import type { enrollmentHistoryGranularQuerySchema, enrollmentHistoryQuerySchema } from "$schema";

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

export class EnrollmentHistoryService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getEnrollmentHistory(input: EnrollmentHistoryServiceInput) {
    // CTE downsamples to one snapshot per section per day
    // Table can hold multi day snapshots but this endpoint has daily granularity
    let downsampledQuery = this.db
      .selectDistinctOn(
        [websocSectionEnrollment.sectionId, sql`DATE(${websocSectionEnrollment.createdAt})`],
        {
          ...getTableColumns(websocSectionEnrollment),
          deptCode: websocCourse.deptCode,
          courseNumber: websocCourse.courseNumber,
          sectionCode: websocSection.sectionCode,
          sectionType: websocSection.sectionType,
          sectionNum: websocSection.sectionNum,
          units: websocSection.units,
          finalExam: websocSection.finalExamString,
          instructors: websocSection.instructors,
        },
      )
      .from(websocSectionEnrollment)
      .innerJoin(websocSection, eq(websocSection.id, websocSectionEnrollment.sectionId))
      .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
      .$dynamic();
    if (input.instructorName) {
      downsampledQuery = downsampledQuery
        .leftJoin(
          websocSectionToInstructor,
          eq(websocSectionToInstructor.sectionId, websocSection.id),
        )
        .leftJoin(
          websocInstructor,
          eq(websocInstructor.name, websocSectionToInstructor.instructorName),
        );
    }
    const downsampled = this.db
      .$with("downsampled")
      .as(
        downsampledQuery
          .where(buildQuery(input))
          .orderBy(
            websocSectionEnrollment.sectionId,
            sql`DATE(${websocSectionEnrollment.createdAt})`,
            websocSectionEnrollment.createdAt,
          ),
      );
    // Join the already-collapsed daily set to meetings/locations. This re-multiplies each daily row
    // by the section's meetings, so dates are still deduplicated.
    const rows = await this.db
      .with(downsampled)
      .select({
        section: {
          id: downsampled.sectionId,
          year: downsampled.year,
          quarter: downsampled.quarter,
          sectionCode: downsampled.sectionCode,
          deptCode: downsampled.deptCode,
          courseNumber: downsampled.courseNumber,
          sectionType: downsampled.sectionType,
          sectionNum: downsampled.sectionNum,
          units: downsampled.units,
          finalExam: downsampled.finalExam,
          instructors: downsampled.instructors,
        },
        enrollment: {
          createdAt: downsampled.createdAt,
          maxCapacity: downsampled.maxCapacity,
          numCurrentlyTotalEnrolled: downsampled.numCurrentlyTotalEnrolled,
          numOnWaitlist: downsampled.numOnWaitlist,
          numWaitlistCap: downsampled.numWaitlistCap,
          numRequested: downsampled.numRequested,
          numNewOnlyReserved: downsampled.numNewOnlyReserved,
          status: downsampled.status,
        },
        meeting: getTableColumns(websocSectionMeeting),
        location: getTableColumns(websocLocation),
      })
      .from(downsampled)
      .innerJoin(websocSectionMeeting, eq(websocSectionMeeting.sectionId, downsampled.sectionId))
      .innerJoin(
        websocSectionMeetingToLocation,
        eq(websocSectionMeeting.id, websocSectionMeetingToLocation.meetingId),
      )
      .innerJoin(websocLocation, eq(websocLocation.id, websocSectionMeetingToLocation.locationId))
      .orderBy(downsampled.sectionId, downsampled.createdAt);

    return Map.groupBy(rows, (row) => row.section.id)
      .values()
      .map((sectionRows) => {
        const { section } = sectionRows[0];
        const meetings = new Map<number, { bldg: Set<string>; days: string; time: string }>();
        const seenDates = new Set<string>();
        const dates: string[] = [];
        const maxCapacityHistory: string[] = [];
        const totalEnrolledHistory: string[] = [];
        const waitlistHistory: string[] = [];
        const waitlistCapHistory: string[] = [];
        const requestedHistory: string[] = [];
        const newOnlyReservedHistory: string[] = [];
        const statusHistory: string[] = [];
        for (const { enrollment, meeting, location } of sectionRows) {
          const bldg = `${location.building} ${location.room}`;
          const existingMeeting = meetings.get(meeting.meetingIndex);
          if (existingMeeting) {
            existingMeeting.bldg.add(bldg);
          } else {
            meetings.set(meeting.meetingIndex, {
              bldg: new Set([bldg]),
              days: meeting.daysString,
              time: meeting.timeString,
            });
          }
          // The meeting join repeats each daily snapshot once per meeting, so skip
          // enrollment data if this date has already been pushed.
          const date = enrollment.createdAt.toISOString().split("T")[0];
          if (seenDates.has(date)) {
            continue;
          }
          seenDates.add(date);
          dates.push(date);
          maxCapacityHistory.push(enrollment.maxCapacity.toString(10));
          totalEnrolledHistory.push(enrollment.numCurrentlyTotalEnrolled?.toString(10) ?? "");
          waitlistHistory.push(enrollment.numOnWaitlist?.toString(10) ?? "");
          waitlistCapHistory.push(enrollment.numWaitlistCap?.toString(10) ?? "");
          requestedHistory.push(enrollment.numRequested?.toString(10) ?? "");
          newOnlyReservedHistory.push(enrollment.numNewOnlyReserved?.toString(10) ?? "");
          statusHistory.push(enrollment.status ?? "");
        }
        return {
          year: section.year,
          quarter: section.quarter,
          sectionCode: section.sectionCode.toString(10).padStart(5, "0"),
          department: section.deptCode,
          courseNumber: section.courseNumber,
          sectionType: section.sectionType,
          sectionNum: section.sectionNum,
          units: section.units,
          instructors: Array.from(new Set(section.instructors)),
          meetings: Array.from(meetings.entries())
            .sort(([a], [b]) => a - b)
            .map(([, { bldg, ...rest }]) => ({ bldg: Array.from(bldg), ...rest })),
          finalExam: section.finalExam,
          dates,
          maxCapacityHistory,
          totalEnrolledHistory,
          waitlistHistory,
          waitlistCapHistory,
          requestedHistory,
          newOnlyReservedHistory,
          statusHistory,
        };
      })
      .toArray();
  }

  async getEnrollmentHistoryGranular(input: EnrollmentHistoryGranularServiceInput) {
    // The instructor join only exists to support the instructorName filter, and it fans out for
    // sections with multiple instructors, so only join it when we actually filter on it.
    let query = this.db
      .select({
        ...getTableColumns(websocSectionEnrollment),
        sectionCode: websocSection.sectionCode,
      })
      .from(websocSectionEnrollment)
      .innerJoin(websocSection, eq(websocSection.id, websocSectionEnrollment.sectionId))
      .innerJoin(websocCourse, eq(websocCourse.id, websocSection.courseId))
      .$dynamic();

    if (input.instructorName) {
      query = query
        .leftJoin(
          websocSectionToInstructor,
          eq(websocSectionToInstructor.sectionId, websocSection.id),
        )
        .leftJoin(
          websocInstructor,
          eq(websocInstructor.name, websocSectionToInstructor.instructorName),
        );
    }

    const enrollmentRows = await query
      .where(
        and(
          buildQuery(input),
          input.from ? gte(websocSectionEnrollment.createdAt, new Date(input.from)) : undefined,
          input.to ? lte(websocSectionEnrollment.createdAt, new Date(input.to)) : undefined,
        ),
      )
      .orderBy(websocSectionEnrollment.sectionId, websocSectionEnrollment.createdAt);

    return Map.groupBy(enrollmentRows, (row) => row.sectionId)
      .values()
      .map((rows) => ({
        year: rows[0].year,
        quarter: rows[0].quarter,
        sectionCode: rows[0].sectionCode.toString(10).padStart(5, "0"),
        snapshots: rows.map((row) => ({
          timestamp: row.createdAt.toISOString(),
          maxCapacity: row.maxCapacity,
          totalEnrolled: row.numCurrentlyTotalEnrolled ?? null,
          waitlist: row.numOnWaitlist ?? null,
          waitlistCap: row.numWaitlistCap ?? null,
          requested: row.numRequested ?? null,
          newOnlyReserved: row.numNewOnlyReserved ?? null,
          status: row.status ?? "",
        })),
      }))
      .toArray();
  }
}
