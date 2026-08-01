import assert from "node:assert/strict";
import test from "node:test";
import type { z } from "zod";
import { courseSchema } from "$schema";
import { CoursesService } from "./courses.ts";
import {
  attachTentativeCourseOfferings,
  type TentativeCourseOfferingRow,
} from "./tentative-course-offerings.ts";

type CourseWithoutTentativeOfferings = Omit<z.infer<typeof courseSchema>, "tentativeOfferings">;

const makeCourse = (
  id: string,
  department: string,
  courseNumber = "161",
): CourseWithoutTentativeOfferings => ({
  id,
  department,
  courseNumber,
  courseNumeric: Number.parseInt(courseNumber, 10),
  school: "University of California, Irvine",
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
  overrides: Partial<TentativeCourseOfferingRow> = {},
): TentativeCourseOfferingRow => ({
  courseId: "COMPSCI161",
  source: "ICS_COURSE_OFFERINGS",
  sourceUrl: "https://courselisting.ics.uci.edu/",
  academicYear: "2026-2027",
  year: "2027",
  quarter: "Winter",
  instructors: [{ status: "assigned", name: "Michael Shindler", ucinetid: "mshindle" }],
  lastUpdated: new Date("2026-07-30T12:00:00.000Z"),
  instructionStart: new Date("2027-01-04T00:00:00.000Z"),
  isPublished: false,
  ...overrides,
});

test("returns an ICS course's tentative offerings with source metadata", () => {
  const course = makeCourse("COMPSCI161", "COMPSCI");
  const confirmedTerms = [...course.terms];
  const [result] = attachTentativeCourseOfferings(
    [course],
    [makeRow()],
    new Date("2026-07-30T00:00:00.000Z"),
  );

  assert.deepEqual(result.terms, confirmedTerms);
  courseSchema.parse(result);
  assert.deepEqual(result.tentativeOfferings, [
    {
      term: "2027 Winter",
      instructors: [{ status: "assigned", name: "Michael Shindler", ucinetid: "mshindle" }],
      source: "ICS_COURSE_OFFERINGS",
      sourceUrl: "https://courselisting.ics.uci.edu/",
      academicYear: "2026-2027",
      lastUpdated: "2026-07-30T12:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
  ]);
});

test("returns tentative offerings inserted for a non-ICS course", () => {
  const [result] = attachTentativeCourseOfferings(
    [makeCourse("MATH2A", "MATH", "2A")],
    [
      makeRow({
        courseId: "MATH2A",
        source: "PHYSICAL_SCIENCES_TENTATIVE_OFFERINGS",
        sourceUrl: "https://example.uci.edu/physical-sciences/course-offerings",
        instructors: [{ status: "tbd", name: "TBD", ucinetid: null }],
        lastUpdated: null,
      }),
    ],
    new Date("2026-07-30T00:00:00.000Z"),
  );

  courseSchema.parse(result);
  assert.deepEqual(result.tentativeOfferings, [
    {
      term: "2027 Winter",
      instructors: [{ status: "tbd", name: "TBD", ucinetid: null }],
      source: "PHYSICAL_SCIENCES_TENTATIVE_OFFERINGS",
      sourceUrl: "https://example.uci.edu/physical-sciences/course-offerings",
      academicYear: "2026-2027",
      lastUpdated: null,
      updatedAt: null,
    },
  ]);
});

test("returns an empty array for any valid course without tentative data", () => {
  const [result] = attachTentativeCourseOfferings(
    [makeCourse("CHEM1A", "CHEM", "1A")],
    [],
    new Date("2026-07-30T00:00:00.000Z"),
  );
  assert.deepEqual(result.tentativeOfferings, []);
});

test("returns null for an invalid course identifier", async () => {
  const query = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return this;
    },
    offset() {
      return this;
    },
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
    then<TResult1 = never[], TResult2 = never>(
      onFulfilled?: ((value: never[]) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve([] as never[]).then(onFulfilled, onRejected);
    },
  };
  const service = new CoursesService({ select: () => query } as never);
  assert.equal(await service.getCourseById("NOT_A_VALID_COURSE"), null);
});

test("suppresses a globally published term regardless of course-specific WebSOC presence", () => {
  const [result] = attachTentativeCourseOfferings(
    [makeCourse("COMPSCI161", "COMPSCI")],
    [makeRow({ isPublished: true })],
    new Date("2026-07-30T00:00:00.000Z"),
  );
  assert.deepEqual(result.tentativeOfferings, []);
});

test("suppresses past, Summer, and out-of-academic-year offerings defensively", () => {
  const [result] = attachTentativeCourseOfferings(
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
