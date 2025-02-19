import { z } from "@hono/zod-openapi";
import type { FinalExamStatus } from "@packages/db/schema";
import { courseLevels, terms, websocSectionTypes, websocStatuses } from "@packages/db/schema";
import { isBaseTenInt } from "@packages/stdlib";
import { courseNumberSchema, daysSchema, timeSchema, yearSchema } from "./lib";

const anyArray = ["ANY"] as const;

const geCategories = [
  "ANY",
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

const fullCoursesOptions = [
  "ANY",
  "SkipFull",
  "SkipFullWaitlist",
  "FullOnly",
  "Overenrolled",
] as const;

const cancelledCoursesOptions = ["Exclude", "Include", "Only"] as const;

const restrictionCodes = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "S",
  "R",
  "X",
] as const;

export type ParsedInteger = {
  _type: "ParsedInteger";
  value: number;
};

export type ParsedString = {
  _type: "ParsedString";
  value: string;
};

export type ParsedRange = {
  _type: "ParsedRange";
  min: number;
  max: number;
};

export type ParsedNumber = ParsedInteger | ParsedString | ParsedRange;

const isValidRestrictionCode = (code: string): code is (typeof restrictionCodes)[number] =>
  (restrictionCodes as readonly string[]).includes(code);

export const websocQuerySchema = z.object({
  year: yearSchema.openapi({
    description: "The academic year to search for courses",
    example: "2024",
  }),
  quarter: z
    .enum(terms, {
      message:
        "Parameter 'quarter' must be one of 'Fall', 'Winter', 'Spring', 'Summer1', 'Summer10wk', or 'Summer2'",
    })
    .openapi({
      description: "The academic quarter to search for courses",
      example: "Fall",
    }),
  ge: z
    .enum(geCategories)
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x)),
  department: z.string().optional().openapi({
    description: "The academic department offering the course",
    example: "COMPSCI",
  }),
  courseTitle: z.string().optional(),
  courseNumber: courseNumberSchema.optional().openapi({
    description:
      "The course number(s) to search for. Can be a single number, multiple numbers separated by commas, or a range using a hyphen",
    example: "161,162",
  }),
  sectionCodes: z
    .string()
    .optional()
    .transform((codes, ctx) => {
      if (!codes) return undefined;
      const parsedNums: Exclude<ParsedNumber, ParsedString>[] = [];
      for (const code of codes.split(",").map((code) => code.trim())) {
        if (code.includes("-")) {
          const [lower, upper] = code.split("-");
          if (!(isBaseTenInt(lower) && isBaseTenInt(upper))) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `'${code}' is not a valid section code range. A valid section code range consists of valid section codes, which are base-10 integers.`,
            });
            return z.NEVER;
          }
          parsedNums.push({
            _type: "ParsedRange",
            min: Number.parseInt(lower, 10),
            max: Number.parseInt(upper, 10),
          });
          continue;
        }
        if (!isBaseTenInt(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `'${code}' is not a valid section code. A valid section code is a base-10 integer.`,
          });
          return z.NEVER;
        }
        parsedNums.push({ _type: "ParsedInteger", value: Number.parseInt(code, 10) });
      }
      return parsedNums;
    }),
  instructorName: z.string().optional().openapi({
    description: "The name of the instructor teaching the course",
    example: "SHINDLER, M.",
  }),
  days: daysSchema.optional().openapi({
    description: "The days of the week when the course meets",
    example: "MWF",
  }),
  building: z.string().optional().openapi({
    description: "The building where the course is held",
    example: "DBH",
  }),
  room: z.string().optional().openapi({
    description: "The room number where the course is held",
    example: "1100",
  }),
  division: z
    .enum(courseLevels)
    .or(z.literal("ANY"))
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x))
    .openapi({
      description: "The academic level of the course (Lower Division, Upper Division, or Graduate)",
      example: "UpperDiv",
    }),
  sectionType: z
    .union([z.enum(anyArray), z.enum(websocSectionTypes)])
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x))
    .openapi({
      description: "The type of course section (Lecture, Discussion, Lab, etc.)",
      example: "Lec",
    }),
  fullCourses: z
    .enum(fullCoursesOptions)
    .optional()
    .transform((x) => (x === "ANY" ? undefined : x))
    .openapi({
      description:
        "How to handle courses that are full (show all, skip full courses, or show only full courses)",
      example: "SkipFull",
    }),
  cancelledCourses: z.enum(cancelledCoursesOptions).optional().openapi({
    description: "Whether to include or exclude cancelled courses in the results",
    example: "Exclude",
  }),
  units: z.optional(z.literal("VAR").or(z.string())).openapi({
    description: "The number of units for the course, or 'VAR' for variable unit courses",
    example: "4",
  }),
  startTime: timeSchema.optional().openapi({
    description: "The earliest start time for the course (in 24-hour format)",
    example: "10:00",
  }),
  endTime: timeSchema.optional().openapi({
    description: "The latest end time for the course (in 24-hour format)",
    example: "15:00",
  }),
  excludeRestrictionCodes: z
    .string()
    .optional()
    .transform((codes, ctx) => {
      if (!codes) return undefined;
      const parsedCodes: Array<(typeof restrictionCodes)[number]> = [];
      for (const code of codes.split(",").map((code) => code.trim())) {
        if (!isValidRestrictionCode(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `'${code}' is not a valid restriction code. Valid restriction codes are ${restrictionCodes.join(", ")}.`,
          });
          return z.NEVER;
        }
        parsedCodes.push(code);
      }
      return parsedCodes;
    })
    .openapi({
      description: "The restriction codes to exclude from the search results (comma-separated)",
      example: "A,B,C",
    }),
});

export const hourMinuteSchema = z.object({
  hour: z.number(),
  minute: z.number(),
});

export const websocSectionMeetingSchema = z.discriminatedUnion("timeIsTBA", [
  z.object({
    timeIsTBA: z.literal<boolean>(true).openapi({
      description: "Indicates if the meeting time is TBA",
      example: true,
    }),
  }),
  z.object({
    timeIsTBA: z.literal<boolean>(false),
    bldg: z
      .string()
      .array()
      .openapi({
        description: "Building(s) where the section meets",
        example: ["DBH 1100", "ICS 174"],
      }),
    days: z.string().openapi({
      description: "Days of the week when the section meets",
      example: "MWF",
    }),
    startTime: hourMinuteSchema.openapi({
      description: "Start time of the meeting",
      example: { hour: 10, minute: 0 },
    }),
    endTime: hourMinuteSchema.openapi({
      description: "End time of the meeting",
      example: { hour: 10, minute: 50 },
    }),
  }),
]);

export const websocSectionFinalExamSchema = z.discriminatedUnion("examStatus", [
  z.object({
    examStatus: z.literal<FinalExamStatus>("NO_FINAL"),
  }),
  z.object({
    examStatus: z.literal<FinalExamStatus>("TBA_FINAL"),
  }),
  z.object({
    examStatus: z.literal<FinalExamStatus>("SCHEDULED_FINAL"),
    dayOfWeek: z.string(),
    month: z.number(),
    day: z.number(),
    startTime: hourMinuteSchema,
    endTime: hourMinuteSchema,
    bldg: z.string().array(),
  }),
]);

export const websocSectionSchema = z.object({
  units: z.string().openapi({
    description: "Number of units for the section",
    example: "4",
  }),
  status: z.enum(websocStatuses).or(z.literal("")).openapi({
    description: "Current enrollment status of the section",
    example: "OPEN",
  }),
  meetings: websocSectionMeetingSchema.array(),
  finalExam: websocSectionFinalExamSchema,
  sectionNum: z.string().openapi({
    description: "Section number",
    example: "A1",
  }),
  instructors: z
    .string()
    .array()
    .openapi({
      description: "List of instructors teaching this section",
      example: ["PATTIS, R.", "SHINDLER, M."],
    }),
  maxCapacity: z.string().openapi({
    description: "Maximum enrollment capacity",
    example: "150",
  }),
  sectionCode: z.string().openapi({
    description: "5-digit section code",
    example: "34050",
  }),
  sectionType: z.enum(websocSectionTypes).openapi({
    description: "Type of section",
    example: "Lec",
  }),
  numRequested: z.string().openapi({
    description: "Number of students who requested enrollment",
    example: "160",
  }),
  restrictions: z.string().openapi({
    description: "Enrollment restrictions",
    example: "A and B",
  }),
  numOnWaitlist: z.string().openapi({
    description: "Number of students on waitlist",
    example: "10",
  }),
  numWaitlistCap: z.string().openapi({
    description: "Waitlist capacity",
    example: "20",
  }),
  sectionComment: z.string().openapi({
    description: "Additional section comments",
    example: "Same as 34060",
  }),
  numNewOnlyReserved: z.string().openapi({
    description: "Number of seats reserved for new students",
    example: "25",
  }),
  numCurrentlyEnrolled: z.object({
    totalEnrolled: z.string().openapi({
      description: "Total number of enrolled students",
      example: "148",
    }),
    sectionEnrolled: z.string().openapi({
      description: "Number of students enrolled in this section",
      example: "148",
    }),
  }),
  updatedAt: z.coerce.date().openapi({
    description: "Last update timestamp",
    example: "2024-03-20T12:00:00Z",
  }),
  webURL: z.string().openapi({
    description: "URL to section details",
    example: "https://www.reg.uci.edu/perl/WebSoc?...",
  }),
});

export const websocCourseSchema = z.object({
  sections: websocSectionSchema.array(),
  deptCode: z.string().openapi({
    description: "Department code",
    example: "COMPSCI",
  }),
  courseTitle: z.string().openapi({
    description: "Course title",
    example: "PROGRAMMING WITH SOFTWARE LIBRARIES",
  }),
  courseNumber: z.string().openapi({
    description: "Course number",
    example: "161",
  }),
  courseComment: z.string().openapi({
    description: "Course-level comments",
    example: "Prerequisites required",
  }),
  prerequisiteLink: z.string().openapi({
    description: "Link to prerequisite details",
    example: "https://www.reg.uci.edu/cob/prrqcgi?term=202410&dept=COMPSCI&action=view_by_term#161",
  }),
  updatedAt: z.coerce.date().openapi({
    description: "Last update timestamp",
    example: "2024-03-20T12:00:00Z",
  }),
});

export const websocDepartmentSchema = z.object({
  courses: websocCourseSchema.array(),
  deptCode: z.string().openapi({
    description: "Department code",
    example: "COMPSCI",
  }),
  deptName: z.string().openapi({
    description: "Department name",
    example: "Computer Science",
  }),
  deptComment: z.string().openapi({
    description: "Department-level comments",
    example: "See department website for more details",
  }),
  sectionCodeRangeComments: z
    .string()
    .array()
    .openapi({
      description: "Comments about section code ranges",
      example: ["34000-34999: Computer Science"],
    }),
  courseNumberRangeComments: z
    .string()
    .array()
    .openapi({
      description: "Comments about course number ranges",
      example: ["100-199: Upper-division courses"],
    }),
  updatedAt: z.coerce.date().openapi({
    description: "Last update timestamp",
    example: "2024-03-20T12:00:00Z",
  }),
});

export const websocSchoolSchema = z.object({
  departments: websocDepartmentSchema.array(),
  schoolName: z.string().openapi({
    description: "School name",
    example: "Donald Bren School of Information and Computer Sciences",
  }),
  schoolComment: z.string().openapi({
    description: "School-level comments",
    example: "See school website for more information",
  }),
  updatedAt: z.coerce.date().openapi({
    description: "Last update timestamp",
    example: "2024-03-20T12:00:00Z",
  }),
});

export const websocResponseSchema = z.object({
  schools: websocSchoolSchema.array(),
});

export const websocTermResponseSchema = z.object({
  shortName: z.string().openapi({
    description: "Short form of the term (e.g., '2024 Spring')",
    example: "2024 Spring",
  }),
  longName: z.string().openapi({
    description: "Full name of the term (e.g., 'Spring Quarter 2024')",
    example: "Spring Quarter 2024",
  }),
});
