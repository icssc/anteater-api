import { load } from "cheerio";
import fetch from "cross-fetch";
import { XMLParser } from "fast-xml-parser";

type RequireAtLeastOne<T, R extends keyof T = keyof T> = Omit<T, R> &
  { [P in R]: Required<Pick<T, P>> & Partial<Omit<T, P>> }[R];

type RequiredOptions = RequireAtLeastOne<{
  ge?: GE;
  department?: string;
  sectionCodes?: string;
  instructorName?: string;
}>;

type BuildingRoomOptions =
  | {
      building?: never;
      room?: never;
    }
  | {
      building: string;
      room?: never;
    }
  | {
      building: string;
      room: string;
    };

type OptionalOptions = {
  division?: Division;
  courseNumber?: string;
  courseTitle?: string;
  sectionType?: SectionType;
  units?: string;
  modality?: Modality;
  days?: string;
  startTime?: string;
  endTime?: string;
  maxCapacity?: string;
  fullCourses?: FullCourses;
  cancelledCourses?: CancelledCourses;
};

/**
 * The quarter in an academic year.
 */
export type Quarter = "Fall" | "Winter" | "Spring" | "Summer1" | "Summer10wk" | "Summer2";

/**
 * The type of the section.
 */
export type SectionType =
  | "ALL"
  | "Act"
  | "Col"
  | "Dis"
  | "Fld"
  | "Lab"
  | "Lec"
  | "Qiz"
  | "Res"
  | "Sem"
  | "Stu"
  | "Tap"
  | "Tut";

/**
 * The option to filter full courses by.
 */
export type FullCourses = "ANY" | "SkipFull" | "SkipFullWaitlist" | "FullOnly" | "Overenrolled";

/**
 * The option to filter cancelled courses by.
 */
export type CancelledCourses = "Exclude" | "Include" | "Only";

/**
 * The GE category code.
 */
export type GE =
  | "ANY"
  | "GE-1A"
  | "GE-1B"
  | "GE-2"
  | "GE-3"
  | "GE-4"
  | "GE-5A"
  | "GE-5B"
  | "GE-6"
  | "GE-7"
  | "GE-8";

/**
 * The division code.
 */
export type Division = "ANY" | "LowerDiv" | "UpperDiv" | "Graduate";

/**
 * The modality of the section.
 */
export type Modality = "" | "Online" | "In-Person";

/**
 * The meeting time for a section.
 */
export type WebsocSectionMeeting = {
  /**
   * What day(s) the section meets on (e.g. ``MWF``).
   */
  days: string;

  /**
   * What time the section meets at.
   */
  time: string;

  /**
   * The building(s) the section meets in.
   */
  bldg: string[];
};

/**
 * The enrollment statistics for a section.
 */
export type WebsocSectionEnrollment = {
  /**
   * The total number of students enrolled in this section.
   */
  totalEnrolled: string;

  /**
   * The number of students enrolled in the section referred to by this section
   * code, if the section is cross-listed. If the section is not cross-listed,
   * this field is the empty string.
   */
  sectionEnrolled: string;
};

/**
 * A WebSoc section object.
 */
export type WebsocSection = {
  /**
   * The section code.
   */
  sectionCode: string;

  /**
   * The section type (e.g. ``Lec``, ``Dis``, ``Lab``, etc.)
   */
  sectionType: Exclude<SectionType, "ALL">;

  /**
   * The section number (e.g. ``A1``).
   */
  sectionNum: string;

  /**
   * The number of units afforded by taking this section.
   */
  units: string;

  /**
   * The name(s) of the instructor(s) teaching this section.
   */
  instructors: string[];

  /**
   * The modality of the section.
   * For responses before a certain date, this field will be the empty string, as it was introduced in Winter 2023
   * and older entries were likely not backfilled on the WebSoc end.
   */
  modality: Modality;

  /**
   * The meeting time(s) of this section.
   */
  meetings: WebsocSectionMeeting[];

  /**
   * The date and time of the final exam for this section.
   */
  finalExam: string;

  /**
   * The maximum capacity of this section.
   */
  maxCapacity: string;

  /**
   * The number of students currently enrolled (cross-listed or otherwise) in
   * this section.
   */
  numCurrentlyEnrolled: WebsocSectionEnrollment;

  /**
   * The number of students currently on the waitlist for this section.
   */
  numOnWaitlist: string;

  /**
   * The maximum number of students that can be on the waitlist for this section.
   */
  numWaitlistCap: string;

  /**
   * The number of students who have requested to be enrolled in this section.
   */
  numRequested: string;

  /**
   * The number of seats in this section reserved for new students.
   */
  numNewOnlyReserved: string;

  /**
   * The restriction code(s) for this section.
   */
  restrictions: string;

  /**
   * The enrollment status.
   */
  status: "OPEN" | "Waitl" | "FULL" | "NewOnly";

  /**
   * Any comments for the section.
   */
  sectionComment: string;

  /**
   * The URL that points to the section's Web page.
   */
  webURL: string;
};

/**
 * A WebSoc course object.
 */
export type WebsocCourse = {
  /**
   * The code of the department the course belongs to.
   */
  deptCode: string;

  /**
   * The course number.
   */
  courseNumber: string;

  /**
   * The title of the course.
   */
  courseTitle: string;

  /**
   * Any comments for the course.
   */
  courseComment: string;

  /**
   * The link to the WebReg Course Prerequisites page for this course.
   */
  prerequisiteLink: string;

  /**
   * All sections of the course.
   */
  sections: WebsocSection[];
};

/**
 * A WebSoc department object.
 */
export type WebsocDepartment = {
  /**
   * The name of the department.
   */
  deptName: string;

  /**
   * The department code.
   */
  deptCode: string;

  /**
   * Any comments from the department.
   */
  deptComment: string;

  /**
   * All courses of the department.
   */
  courses: WebsocCourse[];

  /**
   * Any comments for section code(s) under the department.
   */
  sectionCodeRangeComments: string[];

  /**
   * Any comments for course number(s) under the department.
   */
  courseNumberRangeComments: string[];
};

/**
 * A WebSoc school object.
 */
export type WebsocSchool = {
  /**
   * The name of the school.
   */
  schoolName: string;

  /**
   * Any comments from the school.
   */
  schoolComment: string;

  /**
   * All departments of the school.
   */
  departments: WebsocDepartment[];
};

/**
 * An object that represents a specific term.
 */
export type Term = {
  /**
   * The year of the term.
   */
  year: string;

  /**
   * The quarter of the term.
   */
  quarter: Quarter;
};

/**
 * The type alias for the response from {@link `request`}.
 */
export type WebsocResponse = {
  /**
   * All schools matched by the query.
   */
  schools: WebsocSchool[];
};

/**
 * The type alias for the options object accepted by {@link `request`}.
 *
 * If your editor supports intelligent code completion, the fully expanded
 * initial type will probably look horrifying. But it's really not that bad.
 *
 * It is an error to not provide any of
 * {GE category, department, section code, instructor};
 * it is also an error to provide only the room number without a building code.
 * This type alias strictly enforces these invariants instead of checking during
 * runtime.
 */
export type WebsocOptions = RequiredOptions & BuildingRoomOptions & OptionalOptions;

function getCodedTerm(term: Term): string {
  switch (term.quarter) {
    case "Fall":
      return `${term.year}-92`;
    case "Winter":
      return `${term.year}-03`;
    case "Spring":
      return `${term.year}-14`;
    case "Summer10wk":
      return `${term.year}-39`;
    case "Summer1":
      return `${term.year}-25`;
    case "Summer2":
      return `${term.year}-76`;
  }
}

function getCodedDiv(div: Division): string {
  switch (div) {
    case "ANY":
      return "all";
    case "LowerDiv":
      return "0xx";
    case "UpperDiv":
      return "1xx";
    case "Graduate":
      return "2xx";
  }
}

function getCodedModality(modality: Modality) {
  switch (modality) {
    case "Online":
      return "O";
    case "In-Person":
      return "I";
  }
  return "";
}

/**
 * Makes a request to WebSoc for the given term and options.
 */
export async function request(term: Term, options: WebsocOptions): Promise<WebsocResponse> {
  const {
    ge = "ANY",
    department = "ANY",
    courseNumber = "",
    division = "ANY",
    sectionCodes = "",
    instructorName = "",
    courseTitle = "",
    sectionType = "ALL",
    units = "",
    modality = "",
    days = "",
    startTime = "",
    endTime = "",
    maxCapacity = "",
    fullCourses = "ANY",
    cancelledCourses = "Exclude",
    building = "",
    room = "",
  } = options;

  const params = {
    YearTerm: getCodedTerm(term),
    ShowComments: "on",
    ShowFinals: "on",
    Breadth: ge,
    Dept: department,
    CourseNum: courseNumber,
    Division: getCodedDiv(division),
    CourseCodes: sectionCodes,
    InstrName: instructorName,
    CourseTitle: courseTitle,
    ClassType: sectionType,
    Units: units,
    Modality: getCodedModality(modality),
    Days: days,
    StartTime: startTime,
    EndTime: endTime,
    MaxCap: maxCapacity,
    FullCourses: fullCourses,
    CancelledCourses: cancelledCourses,
    Bldg: building,
    Room: room,
  };

  const webQuery = new URLSearchParams({ ...params, Submit: "Display Web Results" });

  const xmlQuery = new URLSearchParams({ ...params, Submit: "Display XML Results" });

  const [webResponse, xmlResponse] = await Promise.all([
    fetch(`https://www.reg.uci.edu/perl/WebSoc?${webQuery.toString()}`),
    fetch(`https://www.reg.uci.edu/perl/WebSoc?${xmlQuery.toString()}`),
  ]);

  if (webResponse.redirected || xmlResponse.redirected) {
    throw new Error(
      "Encountered a redirect when attempting to fetch WebSoc response. This likely means you are being rate limited - please try again later.",
    );
  }

  const $ = load(await webResponse.text());

  const parser = new XMLParser({
    attributeNamePrefix: "__",
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "__text",
    trimValues: false,
  });

  const res = parser.parse(await xmlResponse.text());

  const json: WebsocResponse = { schools: [] };

  type Maybe<T> = T | undefined;

  const webURLs = new Map(
    $("a")
      .get()
      .filter((x) => x.children.some((y) => (y as unknown as Text).data === "Web"))
      .map((x) => [
        ((x.parent?.parent?.children[0] as Maybe<ParentNode>)?.children?.[0] as Maybe<Text>)?.data,
        x.attribs?.href,
      ]),
  );

  json.schools = res.websoc_results?.course_list
    ? (Array.isArray(res.websoc_results.course_list.school)
        ? res.websoc_results.course_list.school
        : [res.websoc_results.course_list.school]
      ).map((x: Record<string, unknown>) => ({
        schoolName: x.__school_name,
        schoolComment: x.school_comment ? x.school_comment : "",
        departments: (Array.isArray(x.department) ? x.department : [x.department]).map((y) => ({
          deptComment: y.department_comment ? y.department_comment : "",
          sectionCodeRangeComments: y.course_code_range_comment
            ? Array.isArray(y.course_code_range_comment)
              ? y.course_code_range_comment.map((z: Record<string, unknown>) => z.__text)
              : [y.course_code_range_comment.__text]
            : [],
          courseNumberRangeComments: y.course_number_range_comment
            ? Array.isArray(y.course_number_range_comment)
              ? y.course_number_range_comment.map((z: Record<string, unknown>) => z.__text)
              : [y.course_number_range_comment.__text]
            : [],
          deptCode: y.__dept_code,
          deptName: y.__dept_name,
          courses: (Array.isArray(y.course) ? y.course : [y.course]).map(
            (z: Record<string, unknown>) => ({
              deptCode: y.__dept_code,
              courseComment: z.course_comment ? z.course_comment : "",
              prerequisiteLink: z.course_prereq_link ? z.course_prereq_link : "",
              courseNumber: z.__course_number,
              courseTitle: z.__course_title,
              sections: (Array.isArray(z.section) ? z.section : [z.section]).map((w) => ({
                sectionCode: w.course_code,
                sectionType: w.sec_type,
                sectionNum: w.sec_num,
                units: w.sec_units,
                instructors: (Array.isArray(w.sec_instructors?.instructor)
                  ? w.sec_instructors.instructor
                  : [w.sec_instructors?.instructor]
                ).filter((x: unknown) => x),
                modality: w.sec_modality,
                meetings: (Array.isArray(w.sec_meetings.sec_meet)
                  ? w.sec_meetings.sec_meet
                  : [w.sec_meetings.sec_meet]
                ).map((v: Record<string, unknown>) => ({
                  days: v.sec_days,
                  time: v.sec_time,
                  bldg: `${v.sec_bldg} ${v.sec_room}`,
                })),
                finalExam: w.sec_final
                  ? w.sec_final.sec_final_date === "TBA"
                    ? "TBA"
                    : `${w.sec_final.sec_final_day} ${w.sec_final.sec_final_date} ${w.sec_final.sec_final_time}`
                  : "",
                maxCapacity: w.sec_enrollment.sec_max_enroll,
                numCurrentlyEnrolled: {
                  totalEnrolled: w.sec_enrollment.sec_enrolled,
                  sectionEnrolled: w.sec_enrollment.sec_xlist_subenrolled
                    ? w.sec_enrollment.sec_xlist_subenrolled
                    : "",
                },
                numOnWaitlist:
                  w.sec_enrollment.sec_waitlist !== w.course_code
                    ? w.sec_enrollment.sec_waitlist
                    : "",
                numWaitlistCap:
                  w.sec_enrollment.sec_wait_cap !== w.course_code
                    ? w.sec_enrollment.sec_wait_cap
                    : "",
                numRequested: w.sec_enrollment.sec_enroll_requests,
                numNewOnlyReserved:
                  w.sec_enrollment.sec_new_only_reserved !== w.course_code
                    ? w.sec_enrollment.sec_new_only_reserved
                    : "",
                restrictions: w.sec_restrictions ? w.sec_restrictions : "",
                status: w.sec_status,
                sectionComment: w.sec_comment ? w.sec_comment : "",
                webURL: webURLs.get(w.course_code) ?? "",
              })),
            }),
          ),
        })),
      }))
    : [];

  return json;
}
