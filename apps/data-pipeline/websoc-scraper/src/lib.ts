import type {
  Quarter,
  Term,
  WebsocCourse,
  WebsocDepartment,
  WebsocResponse,
  WebsocSchool,
  WebsocSection,
  WebsocSectionMeeting,
} from "@icssc/libwebsoc-next";
import { request } from "@icssc/libwebsoc-next";
import type { database } from "@packages/db";
import { and, asc, eq, gte, inArray, lte } from "@packages/db/drizzle";
import type { WebsocSectionFinalExam } from "@packages/db/schema";
import {
  calendarTerm,
  course,
  websocCourse,
  websocDepartment,
  websocInstructor,
  websocLocation,
  websocMeta,
  websocSchool,
  websocSection,
  websocSectionEnrollment,
  websocSectionMeeting,
  websocSectionMeetingToLocation,
  websocSectionToInstructor,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { baseTenIntOrNull, notNull, sleep } from "@packages/stdlib";
import { load } from "cheerio";

async function getDepts(db: ReturnType<typeof database>) {
  const response = await fetch("https://www.reg.uci.edu/perl/WebSoc").then((x) => x.text());

  const $ = load(response);

  const termsFromWebsoc = $("form")
    .eq(1)
    .find("select")
    .eq(2)
    .text()
    .replace(/\t/g, "")
    .replace(/ {4}/g, "")
    .split("\n")
    .map((x) =>
      x
        .split(".")
        .filter((y) => y !== " ")
        .map((y) => y.trim()),
    )
    .filter((x) => x[0].length)
    .map((x) => (x.length === 1 ? "ALL" : x[0]))
    .filter((x) => x !== "ALL");

  const termsFromDb = await db
    .select({ department: course.department })
    .from(course)
    .then((rows) => Array.from(new Set(rows.map((row) => row.department))));

  return Array.from(new Set(termsFromWebsoc.concat(termsFromDb))).toSorted();
}

async function getTermsToScrape(db: ReturnType<typeof database>) {
  const now = new Date();
  return db
    .select({
      id: calendarTerm.id,
      year: calendarTerm.year,
      quarter: calendarTerm.quarter,
    })
    .from(calendarTerm)
    .where(and(gte(calendarTerm.finalsStart, now), lte(calendarTerm.socAvailable, now)));
}

const termToName = (term: Term) => `${term.year} ${term.quarter}`;

const nameToTerm = (name: string): Term => ({
  year: name.split(" ")[0],
  quarter: name.split(" ")[1] as Quarter,
});

const schoolMapper = (
  term: Term,
  { schoolName, schoolComment }: WebsocSchool,
): typeof websocSchool.$inferInsert => ({
  ...term,
  schoolName,
  schoolComment,
});

const departmentMapper = (
  term: Term,
  schoolId: string,
  {
    deptName,
    deptCode,
    deptComment,
    sectionCodeRangeComments,
    courseNumberRangeComments,
  }: WebsocDepartment,
): typeof websocDepartment.$inferInsert => ({
  ...term,
  schoolId,
  deptName,
  deptCode,
  deptComment,
  sectionCodeRangeComments,
  courseNumberRangeComments,
});

function courseMapper(
  term: Term,
  departmentId: string,
  course: WebsocCourse,
  schoolName: string,
): typeof websocCourse.$inferInsert {
  return {
    ...term,
    departmentId,
    ...course,
    schoolName,
  };
}

function parseStartAndEndTimes(time: string) {
  let startTime: number;
  let endTime: number;
  const [startTimeString, endTimeString] = time
    .trim()
    .split("-")
    .map((x) => x.trim());
  const [startTimeHour, startTimeMinute] = startTimeString.split(":");
  startTime = (Number.parseInt(startTimeHour, 10) % 12) * 60 + Number.parseInt(startTimeMinute, 10);
  const [endTimeHour, endTimeMinute] = endTimeString.split(":");
  endTime = (Number.parseInt(endTimeHour, 10) % 12) * 60 + Number.parseInt(endTimeMinute, 10);
  if (endTimeMinute.includes("p")) {
    startTime += 12 * 60;
    endTime += 12 * 60;
  }
  if (startTime > endTime) startTime -= 12 * 60;
  return { startTime, endTime };
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseFinalExamString(
  term: Term,
  section: Pick<WebsocSection, "finalExam" | "meetings">,
): WebsocSectionFinalExam {
  if (section.finalExam === "")
    return {
      examStatus: "NO_FINAL" as const,
    };
  if (section.finalExam === "TBA")
    return {
      examStatus: "TBA_FINAL" as const,
    };
  const [dateTime, locations] = section.finalExam.split("@").map((x) => x?.trim());
  const [_, month, day, time] = dateTime.split(" ");
  const { startTime, endTime } = parseStartAndEndTimes(time);
  const startDate = new Date(
    Date.UTC(
      Number.parseInt(term.year, 10),
      months.indexOf(month),
      Number.parseInt(day, 10),
      Math.floor(startTime / 60),
      startTime % 60,
    ),
  );
  const endDate = new Date(
    Date.UTC(
      Number.parseInt(term.year, 10),
      months.indexOf(month),
      Number.parseInt(day, 10),
      Math.floor(endTime / 60),
      endTime % 60,
    ),
  );
  return {
    examStatus: "SCHEDULED_FINAL" as const,
    dayOfWeek: days[startDate.getUTCDay()],
    month: startDate.getUTCMonth() + 1,
    day: startDate.getUTCDay(),
    startTime: {
      hour: startDate.getUTCHours(),
      minute: startDate.getUTCMinutes(),
    },
    endTime: {
      hour: endDate.getUTCHours(),
      minute: endDate.getUTCMinutes(),
    },
    bldg: locations ? locations.split(",").map((x) => x?.trim()) : [section.meetings[0].bldg[0]],
  };
}

function generateRestrictions(section: Pick<WebsocSection, "restrictions">) {
  const restrictions = {
    restrictionA: false,
    restrictionB: false,
    restrictionC: false,
    restrictionD: false,
    restrictionE: false,
    restrictionF: false,
    restrictionG: false,
    restrictionH: false,
    restrictionI: false,
    restrictionJ: false,
    restrictionK: false,
    restrictionL: false,
    restrictionM: false,
    restrictionN: false,
    restrictionO: false,
    restrictionR: false,
    restrictionS: false,
    restrictionX: false,
  };
  for (const restr of section.restrictions.split(/ and | or /g)) {
    switch (restr) {
      case "A":
        restrictions.restrictionA = true;
        break;
      case "B":
        restrictions.restrictionB = true;
        break;
      case "C":
        restrictions.restrictionC = true;
        break;
      case "D":
        restrictions.restrictionD = true;
        break;
      case "E":
        restrictions.restrictionE = true;
        break;
      case "F":
        restrictions.restrictionF = true;
        break;
      case "G":
        restrictions.restrictionG = true;
        break;
      case "H":
        restrictions.restrictionH = true;
        break;
      case "I":
        restrictions.restrictionI = true;
        break;
      case "J":
        restrictions.restrictionJ = true;
        break;
      case "K":
        restrictions.restrictionK = true;
        break;
      case "L":
        restrictions.restrictionL = true;
        break;
      case "M":
        restrictions.restrictionM = true;
        break;
      case "N":
        restrictions.restrictionN = true;
        break;
      case "O":
        restrictions.restrictionO = true;
        break;
      case "R":
        restrictions.restrictionR = true;
        break;
      case "S":
        restrictions.restrictionS = true;
        break;
      case "X":
        restrictions.restrictionX = true;
        break;
    }
  }
  return restrictions;
}

function rawMeetingMapper(meeting: WebsocSectionMeeting) {
  if (meeting.time.includes("TBA")) {
    return { timeIsTBA: true as const };
  }
  const { startTime, endTime } = parseStartAndEndTimes(meeting.time);
  return {
    timeIsTBA: false as const,
    bldg: meeting.bldg,
    days: meeting.days,
    startTime: { hour: Math.floor(startTime / 60), minute: startTime % 60 },
    endTime: { hour: Math.floor(endTime / 60), minute: endTime % 60 },
  };
}

function sectionMapper(
  term: Term,
  courseId: string,
  {
    maxCapacity,
    sectionCode,
    numRequested,
    numOnWaitlist,
    numWaitlistCap,
    numNewOnlyReserved,
    numCurrentlyEnrolled,
    ...rest
  }: WebsocSection,
): typeof websocSection.$inferInsert {
  return {
    ...term,
    ...rest,
    ...generateRestrictions(rest),
    courseId,
    finalExamString: rest.finalExam,
    finalExam: parseFinalExamString(term, rest),
    meetings: rest.meetings.map(rawMeetingMapper),
    maxCapacity: Number.parseInt(maxCapacity, 10),
    sectionCode: Number.parseInt(sectionCode, 10),
    numRequested: Number.parseInt(numRequested, 10),
    numOnWaitlist: numOnWaitlist?.startsWith("off")
      ? baseTenIntOrNull(numOnWaitlist.split("(")[1].slice(0, -1))
      : baseTenIntOrNull(numOnWaitlist),
    numWaitlistCap: baseTenIntOrNull(numWaitlistCap),
    numNewOnlyReserved: baseTenIntOrNull(numNewOnlyReserved),
    numCurrentlySectionEnrolled: baseTenIntOrNull(numCurrentlyEnrolled.sectionEnrolled),
    numCurrentlyTotalEnrolled: baseTenIntOrNull(numCurrentlyEnrolled.totalEnrolled),
  };
}

function meetingMapper(
  term: Term,
  sectionId: string,
  sectionCode: number,
  meeting: WebsocSectionMeeting,
  meetingIndex: number,
): typeof websocSectionMeeting.$inferInsert {
  const res: typeof websocSectionMeeting.$inferInsert = {
    ...term,
    timeString: meeting.time,
    daysString: meeting.days,
    sectionId,
    sectionCode,
    meetingIndex,
  };
  if (meeting.time.trim() === "TBA") return res;
  const { startTime, endTime } = parseStartAndEndTimes(meeting.time);
  res.startTime = new Date(startTime * 60 * 1000);
  res.endTime = new Date(endTime * 60 * 1000);
  for (const day of meeting.days.split(/([A-Z][a-z]?)/).filter((x) => x)) {
    switch (day) {
      case "M":
        res.meetsMonday = true;
        break;
      case "Tu":
        res.meetsTuesday = true;
        break;
      case "W":
        res.meetsWednesday = true;
        break;
      case "Th":
        res.meetsThursday = true;
        break;
      case "F":
        res.meetsFriday = true;
        break;
      case "Sa":
        res.meetsSaturday = true;
        break;
      case "Su":
        res.meetsSunday = true;
        break;
    }
  }
  return res;
}

const doDepartmentUpsert = async (
  db: ReturnType<typeof database>,
  term: Term,
  resp: WebsocResponse,
) =>
  await db.transaction(async (tx) => {
    const schools = await tx
      .insert(websocSchool)
      .values(resp.schools.map((school) => schoolMapper(term, school)))
      .onConflictDoUpdate({
        target: [websocSchool.year, websocSchool.quarter, websocSchool.schoolName],
        set: conflictUpdateSetAllCols(websocSchool),
      })
      .returning({ id: websocSchool.id, schoolName: websocSchool.schoolName })
      .then((rows) => new Map(rows.map((row) => [row.schoolName, row.id])));
    const departments = await tx
      .insert(websocDepartment)
      .values(
        resp.schools
          .flatMap((school) =>
            school.departments.map((dept) => {
              const maybeSchool = schools.get(school.schoolName);
              return maybeSchool ? departmentMapper(term, maybeSchool, dept) : undefined;
            }),
          )
          .filter(notNull),
      )
      .onConflictDoUpdate({
        target: [
          websocDepartment.year,
          websocDepartment.quarter,
          websocDepartment.schoolId,
          websocDepartment.deptCode,
        ],
        set: conflictUpdateSetAllCols(websocDepartment),
      })
      .returning({ id: websocDepartment.id, deptCode: websocDepartment.deptCode })
      .then((rows) => new Map(rows.map((row) => [row.deptCode, row.id])));
    const courses = await tx
      .insert(websocCourse)
      .values(
        resp.schools
          .flatMap((school) =>
            school.departments.flatMap((dept) =>
              dept.courses.map((course) => {
                const maybeDept = departments.get(dept.deptCode);
                return maybeDept
                  ? courseMapper(term, maybeDept, course, school.schoolName)
                  : undefined;
              }),
            ),
          )
          .filter(notNull),
      )
      .onConflictDoUpdate({
        target: [
          websocCourse.year,
          websocCourse.quarter,
          websocCourse.schoolName,
          websocCourse.deptCode,
          websocCourse.courseNumber,
          websocCourse.courseTitle,
        ],
        set: conflictUpdateSetAllCols(websocCourse),
      })
      .returning({
        id: websocCourse.id,
        deptCode: websocCourse.deptCode,
        courseNumber: websocCourse.courseNumber,
        courseTitle: websocCourse.courseTitle,
      })
      .then(
        (rows) =>
          new Map(
            rows.map((row) => [`${row.deptCode} ${row.courseNumber} (${row.courseTitle})`, row.id]),
          ),
      );
    const mappedSections = resp.schools.flatMap((school) =>
      school.departments
        .flatMap((dept) =>
          dept.courses.flatMap((course) =>
            course.sections.map((section) => {
              const maybeCourse = courses.get(
                `${course.deptCode} ${course.courseNumber} (${course.courseTitle})`,
              );
              return maybeCourse ? sectionMapper(term, maybeCourse, section) : undefined;
            }),
          ),
        )
        .filter(notNull),
    );
    const sections = await tx
      .insert(websocSection)
      .values(mappedSections)
      .onConflictDoUpdate({
        target: [websocSection.year, websocSection.quarter, websocSection.sectionCode],
        set: conflictUpdateSetAllCols(websocSection),
      })
      .returning({ id: websocSection.id, sectionCode: websocSection.sectionCode })
      .then(
        (rows) =>
          new Map(rows.map((row) => [row.sectionCode.toString(10).padStart(5, "0"), row.id])),
      );
    const enrollmentEntries = await tx
      .insert(websocSectionEnrollment)
      .values(
        mappedSections
          .map(({ sectionCode, ...rest }) => {
            const sectionId = sections.get(sectionCode.toString(10).padStart(5, "0"));
            return sectionId ? { sectionId, ...rest } : undefined;
          })
          .filter(notNull),
      )
      .onConflictDoNothing({
        target: [websocSectionEnrollment.sectionId, websocSectionEnrollment.createdAt],
      })
      .returning({ id: websocSectionEnrollment.id });
    console.log(`Inserted ${enrollmentEntries.length} enrollment entries`);
    const sectionsToInstructors = resp.schools
      .flatMap((school) =>
        school.departments.flatMap((dept) =>
          dept.courses.flatMap((course) =>
            course.sections.flatMap((section) =>
              section.instructors.map((instructor) => [section.sectionCode, instructor]),
            ),
          ),
        ),
      )
      .reduce((acc, [sectionCode, instructor]) => {
        if (acc.get(sectionCode)) {
          acc.get(sectionCode)?.push(instructor);
          return acc;
        }
        return acc.set(sectionCode, [instructor]);
      }, new Map<string, string[]>());
    await tx
      .insert(websocInstructor)
      .values(
        Array.from(new Set(sectionsToInstructors.values())).flatMap((names) =>
          names.map((name) => ({ name })),
        ),
      )
      .onConflictDoNothing();
    await tx.delete(websocSectionToInstructor).where(
      inArray(
        websocSectionToInstructor.sectionId,
        Array.from(sectionsToInstructors.keys())
          .map((key) => sections.get(key))
          .filter(notNull),
      ),
    );
    await tx.insert(websocSectionToInstructor).values(
      Array.from(sectionsToInstructors.entries())
        .flatMap(([k, names]) =>
          names.map((instructorName) => {
            const sectionId = sections.get(k);
            return sectionId ? { sectionId, instructorName } : undefined;
          }),
        )
        .filter(notNull),
    );
    await tx
      .delete(websocSectionMeeting)
      .where(inArray(websocSectionMeeting.sectionId, Array.from(sections.values())));
    const meetings = await tx
      .insert(websocSectionMeeting)
      .values(
        resp.schools
          .flatMap((school) =>
            school.departments.flatMap((dept) =>
              dept.courses.flatMap((course) =>
                course.sections.flatMap((section) =>
                  section.meetings.map((meeting, index) => {
                    const maybeSection = sections.get(section.sectionCode);
                    return maybeSection
                      ? meetingMapper(
                          term,
                          maybeSection,
                          Number.parseInt(section.sectionCode, 10),
                          meeting,
                          index,
                        )
                      : undefined;
                  }),
                ),
              ),
            ),
          )
          .filter(notNull),
      )
      .returning({
        id: websocSectionMeeting.id,
        sectionCode: websocSectionMeeting.sectionCode,
        meetingIndex: websocSectionMeeting.meetingIndex,
      })
      .then(
        (rows) =>
          new Map(
            rows.map((row) => [
              `${row.sectionCode.toString(10).padStart(5, "0")} ${row.meetingIndex}`,
              row.id,
            ]),
          ),
      );
    const meetingsToLocations = new Map(
      resp.schools
        .flatMap((school) =>
          school.departments.flatMap((dept) =>
            dept.courses.flatMap((course) =>
              course.sections.flatMap((section) =>
                section.meetings.flatMap((meeting, index) =>
                  meeting.bldg.map((location): [string, string] | undefined => {
                    const maybeMeeting = meetings.get(`${section.sectionCode} ${index}`);
                    return maybeMeeting ? [maybeMeeting, location] : undefined;
                  }),
                ),
              ),
            ),
          ),
        )
        .filter(notNull),
    );
    const locations = await tx
      .insert(websocLocation)
      .values(
        Array.from(new Set(meetingsToLocations.values())).map((location) => {
          const firstSpace = location.indexOf(" ");
          const building = location.slice(0, firstSpace);
          const room = location.slice(firstSpace + 1);
          return { building, room };
        }),
      )
      .onConflictDoUpdate({
        target: [websocLocation.building, websocLocation.room],
        set: conflictUpdateSetAllCols(websocLocation),
      })
      .returning({
        id: websocLocation.id,
        building: websocLocation.building,
        room: websocLocation.room,
      })
      .then((rows) => new Map(rows.map((row) => [`${row.building} ${row.room}`, row.id])));
    await tx
      .insert(websocSectionMeetingToLocation)
      .values(
        Array.from(meetingsToLocations.entries())
          .map(([meetingId, v]) => {
            const locationId = locations.get(v);
            return locationId ? { meetingId, locationId } : undefined;
          })
          .filter(notNull),
      )
      .onConflictDoUpdate({
        target: [
          websocSectionMeetingToLocation.meetingId,
          websocSectionMeetingToLocation.locationId,
        ],
        set: conflictUpdateSetAllCols(websocSectionMeetingToLocation),
      });
    console.log();
  });

const getUniqueMeetings = (meetings: WebsocSectionMeeting[]) =>
  meetings.reduce<WebsocSectionMeeting[]>((acc, meeting) => {
    const i = acc.findIndex((m) => m.days === meeting.days && m.time === meeting.time);
    if (i === -1) {
      acc.push(meeting);
    } else {
      acc[i].bldg.push(...meeting.bldg);
    }
    return acc;
  }, []);

function normalizeCourse(courses: WebsocCourse[]): WebsocCourse[] {
  for (const course of courses) {
    for (const section of course.sections) {
      for (const meeting of section.meetings) {
        meeting.bldg = [meeting.bldg].flat();
      }
      section.meetings = getUniqueMeetings(section.meetings);
    }
  }
  return courses;
}

function normalizeResponse(json: WebsocResponse): WebsocResponse {
  for (const school of json.schools) {
    for (const dept of school.departments) {
      dept.deptName = dept.deptName.replace(/&amp;/g, "&");
      const courseMapping = new Map<string, WebsocCourse>();
      for (const course of normalizeCourse(dept.courses)) {
        const courseKey = `${course.deptCode},${course.courseNumber},${course.courseTitle}`;
        if (!courseMapping.has(courseKey)) {
          courseMapping.set(courseKey, course);
        } else {
          courseMapping.get(courseKey)?.sections.push(...course.sections);
        }
      }
      dept.courses = Array.from(courseMapping.values());
    }
  }
  return json;
}

type CourseGEUpdate = {
  isGE1A?: boolean;
  isGE1B?: boolean;
  isGE2?: boolean;
  isGE3?: boolean;
  isGE4?: boolean;
  isGE5A?: boolean;
  isGE5B?: boolean;
  isGE6?: boolean;
  isGE7?: boolean;
  isGE8?: boolean;
};

const geCategories = [
  "GE-1A",
  "GE-1B",
  "GE-2",
  "GE-3",
  "GE-4",
  "GE-5A",
  "GE-5B",
  "GE-6",
  "GE-7",
  "GE-8",
] as const;

const geCategoryToFlag: Record<(typeof geCategories)[number], keyof CourseGEUpdate> = {
  "GE-1A": "isGE1A",
  "GE-1B": "isGE1B",
  "GE-2": "isGE2",
  "GE-3": "isGE3",
  "GE-4": "isGE4",
  "GE-5A": "isGE5A",
  "GE-5B": "isGE5B",
  "GE-6": "isGE6",
  "GE-7": "isGE7",
  "GE-8": "isGE8",
};

async function scrapeGEsForTerm(db: ReturnType<typeof database>, term: Term) {
  const updates = new Map<string, CourseGEUpdate>();
  for (const ge of geCategories) {
    console.log(`Scraping GE ${ge}`);
    const resp = await request(term, { ge, cancelledCourses: "Include" }).then(normalizeResponse);
    const courses = resp.schools.flatMap((school) =>
      school.departments.flatMap((dept) =>
        dept.courses.map(
          (course) => `${course.deptCode},${course.courseNumber},${course.courseTitle}`,
        ),
      ),
    );
    for (const course of courses) {
      const update = updates.get(course);
      if (update) {
        update[geCategoryToFlag[ge]] = true;
      } else {
        updates.set(course, { [geCategoryToFlag[ge]]: true });
      }
    }
    await sleep(500);
  }
  await db.transaction(async (tx) => {
    for (const [course, update] of updates) {
      const [deptCode, courseNumber, courseTitle] = course.split(",", 3);
      await tx
        .update(websocCourse)
        .set(update)
        .where(
          and(
            eq(websocCourse.year, term.year),
            eq(websocCourse.quarter, term.quarter),
            eq(websocCourse.deptCode, deptCode),
            eq(websocCourse.courseNumber, courseNumber),
            eq(websocCourse.courseTitle, courseTitle),
          ),
        );
    }
  });
  console.log(`Updated GE data for ${updates.size} courses`);
}

export async function scrapeTerm(db: ReturnType<typeof database>, term: Term) {
  const name = termToName(term);
  console.log(`Scraping term ${name}`);
  for (const department of await getDepts(db)) {
    console.log(`Scraping department ${department}`);
    const resp = await request(term, { department, cancelledCourses: "Include" }).then(
      normalizeResponse,
    );
    if (resp.schools.length) await doDepartmentUpsert(db, term, resp);
    await sleep(500);
  }
  await scrapeGEsForTerm(db, term);
  const lastScraped = new Date();
  await db
    .insert(websocMeta)
    .values({ name, lastScraped })
    .onConflictDoUpdate({ target: websocMeta.name, set: { lastScraped } });
}

export async function doScrape(db: ReturnType<typeof database>) {
  console.log("websoc-scraper starting");
  const termsToScrape = await getTermsToScrape(db);
  const termsInDatabase = await db
    .select()
    .from(websocMeta)
    .where(
      inArray(
        websocMeta.name,
        termsToScrape.map((term) => term.id),
      ),
    )
    .orderBy(asc(websocMeta.lastScraped))
    .then((rows) =>
      rows.reduce((acc, row) => acc.set(row.name, row.lastScraped), new Map<string, Date>()),
    );
  const term = termsInDatabase.keys().next().value;
  if (term) {
    await scrapeTerm(db, nameToTerm(term));
  } else {
    console.log("Nothing to do.");
  }
  console.log("All done!");
}
