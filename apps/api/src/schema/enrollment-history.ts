import { z } from "@hono/zod-openapi";
import { terms, websocSectionTypes, websocStatuses } from "@packages/db/schema";
import { yearSchema } from "./lib";

export const enrollmentHistoryQuerySchema = z
  .object({
    year: yearSchema.optional().openapi({
      description: "Academic year",
      example: "2024",
    }),
    quarter: z
      .enum(terms, {
        invalid_type_error: "Invalid quarter provided",
      })
      .optional()
      .openapi({
        description: "The academic quarter to search for enrollment data",
        example: "Fall",
        enum: ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"],
      }),
    instructorName: z.string().optional().openapi({
      description: "The name of the instructor teaching the section",
      example: "SHINDLER, M.",
    }),
    department: z.string().optional().openapi({
      description: "The academic department offering the course",
      example: "COMPSCI",
    }),
    courseNumber: z.string().optional().openapi({
      description: "The course number to search for",
      example: "161",
    }),
    sectionCode: z
      .string()
      .regex(/^\d{5}$/, { message: "Invalid sectionCode provided" })
      .transform((x) => Number.parseInt(x, 10))
      .optional()
      .openapi({
        description: "The unique 5-digit code that identifies a specific course section",
        example: "34050",
        pattern: "^\\d{5}$",
      }),
    sectionType: z
      .enum(websocSectionTypes, {
        invalid_type_error: "Invalid sectionType provided",
      })
      .optional()
      .openapi({
        description: "The type of section",
        example: "Lec",
        enum: ["Act", "Col", "Dis", "Fld", "Lab", "Lec", "Qiz", "Res", "Sem", "Stu", "Tap", "Tut"],
      }),
  })
  .refine(
    (x) =>
      (x.department && x.courseNumber) ||
      (x.sectionCode && x.year && x.quarter) ||
      (x.instructorName && x.courseNumber && x.year && x.quarter),
    {
      message:
        "Must provide department and course number; section code and year/quarter; or instructor name, course number, and year/quarter",
    },
  );

export const enrollmentHistorySchema = z.object({
  year: z.string().openapi({
    example: "2024",
    description: "Academic year",
  }),
  quarter: z.enum(terms).openapi({
    example: "Fall",
    description: "Academic quarter",
  }),
  sectionCode: z.string().openapi({
    example: "34050",
    description: "5-digit section code",
  }),
  department: z.string().openapi({
    example: "COMPSCI",
    description: "Department code",
  }),
  courseNumber: z.string().openapi({
    example: "161",
    description: "Course number",
  }),
  sectionType: z.enum(websocSectionTypes).openapi({
    example: "Lec",
    description: "Type of section (Lecture, Discussion, etc.)",
  }),
  sectionNum: z.string().openapi({
    example: "A",
    description: "Section identifier",
  }),
  units: z.string().openapi({
    example: "4",
    description: "Number of units",
  }),
  instructors: z
    .string()
    .array()
    .openapi({
      example: ["SHINDLER, M."],
      description: "List of instructors teaching this section",
    }),
  meetings: z
    .object({
      bldg: z.string().array(),
      days: z.string(),
      time: z.string(),
    })
    .array()
    .openapi({
      example: [
        {
          bldg: ["DBH 1100"],
          days: "MWF",
          time: "10:00-10:50",
        },
      ],
      description: "Meeting times and locations",
    }),
  finalExam: z.string().openapi({
    example: "Mon, Dec 11, 10:30-12:30pm",
    description: "Final exam date and time",
  }),
  dates: z
    .string()
    .array()
    .openapi({
      example: ["2024-09-28", "2024-10-05", "2024-10-12"],
      description: "Dates when enrollment data was collected",
    }),
  maxCapacityHistory: z
    .string()
    .array()
    .openapi({
      example: ["120", "120", "120"],
      description: "Maximum enrollment capacity over time",
    }),
  totalEnrolledHistory: z
    .string()
    .array()
    .openapi({
      example: ["89", "112", "120"],
      description: "Total number of enrolled students over time",
    }),
  waitlistHistory: z
    .string()
    .array()
    .openapi({
      example: ["0", "5", "10"],
      description: "Number of students on waitlist over time",
    }),
  waitlistCapHistory: z
    .string()
    .array()
    .openapi({
      example: ["20", "20", "20"],
      description: "Waitlist capacity over time",
    }),
  requestedHistory: z
    .string()
    .array()
    .openapi({
      example: ["89", "117", "130"],
      description: "Total number of enrollment requests over time",
    }),
  newOnlyReservedHistory: z
    .string()
    .array()
    .openapi({
      example: ["30", "30", "30"],
      description: "Number of seats reserved for new students",
    }),
  statusHistory: z
    .union([z.literal(""), z.enum(websocStatuses)])
    .array()
    .openapi({
      example: ["OPEN", "OPEN", "FULL"],
      description: "Section status over time (OPEN, FULL, etc.)",
    }),
});
