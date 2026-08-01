import assert from "node:assert/strict";
import test from "node:test";
import type { z } from "zod";
import type { courseSchema } from "$schema";
import {
  attachTentativeOfferings,
  type TentativeOfferingEligibilityRow,
} from "./tentative-course-offerings.ts";

type CourseWithoutTentativeOfferings = Omit<z.infer<typeof courseSchema>, "tentativeOfferings">;

const makeCourse = (id: string, department: string): CourseWithoutTentativeOfferings => ({
  id,
  department,
  courseNumber: "161",
  courseNumeric: 161,
  school: "Donald Bren School of Information and Computer Sciences",
  title: "Test Course",
  courseLevel: "Upper Division (100-199)",
  minUnits: 4,
  maxUnits: 4,
  description: "",
  departmentName: "Computer Science",
  instructors: [],
  prerequisiteTree: {},
  prerequisiteText: "",
  prerequisites: [],
  dependencies: [],
  repeatability: "",
  repeatabilityTimes: null,
  repeatabilityType: null,
  gradingOption: "",
  concurrent: "",
  sameAs: "",
  restriction: "",
  overlap: "",
  corequisites: "",
  geList: [],
  geText: "",
  terms: ["2025 Fall"],
});

const makeRow = (
  overrides: Partial<TentativeOfferingEligibilityRow> = {},
): TentativeOfferingEligibilityRow => ({
  courseId: "COMPSCI161",
  source: "ICS_COURSE_OFFERINGS",
  academicYear: "2026-2027",
  year: "2027",
  quarter: "Winter",
  instructors: [{ status: "assigned", name: "Michael Shindler", ucinetid: "mshindle" }],
  updatedAt: new Date("2026-07-30T12:00:00.000Z"),
  instructionStart: new Date("2027-01-04T00:00:00.000Z"),
  isPublished: false,
  ...overrides,
});

test("attaches eligible offerings with provenance while leaving confirmed terms untouched", () => {
  const course = makeCourse("COMPSCI161", "COMPSCI");
  const confirmedTerms = [...course.terms];
  const [result] = attachTentativeOfferings(
    [course],
    [makeRow()],
    new Date("2026-07-30T00:00:00.000Z"),
  );

  assert.deepEqual(result.terms, confirmedTerms);
  assert.deepEqual(result.tentativeOfferings, [
    {
      term: "2027 Winter",
      instructors: [{ status: "assigned", name: "Michael Shindler", ucinetid: "mshindle" }],
      source: "ICS_COURSE_OFFERINGS",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
  ]);
});

test("suppresses a globally published term regardless of course-specific WebSOC presence", () => {
  const [result] = attachTentativeOfferings(
    [makeCourse("COMPSCI161", "COMPSCI")],
    [makeRow({ isPublished: true })],
    new Date("2026-07-30T00:00:00.000Z"),
  );
  assert.deepEqual(result.tentativeOfferings, []);
});

test("suppresses past, Summer, and out-of-academic-year offerings defensively", () => {
  const [result] = attachTentativeOfferings(
    [makeCourse("COMPSCI161", "COMPSCI")],
    [
      makeRow({ instructionStart: new Date("2026-01-01T00:00:00.000Z") }),
      makeRow({
        year: "2027",
        quarter: "Summer1",
        instructionStart: new Date("2027-06-21T00:00:00.000Z"),
      }),
      makeRow({ academicYear: "2025-2026" }),
    ],
    new Date("2026-07-30T00:00:00.000Z"),
  );
  assert.deepEqual(result.tentativeOfferings, []);
});

test("returns null for unsupported courses and an empty array for supported courses", () => {
  const [unsupported, supported] = attachTentativeOfferings(
    [makeCourse("MATH2A", "MATH"), makeCourse("STATS67", "STATS")],
    [],
    new Date("2026-07-30T00:00:00.000Z"),
  );
  assert.equal(unsupported.tentativeOfferings, null);
  assert.deepEqual(supported.tentativeOfferings, []);
});
