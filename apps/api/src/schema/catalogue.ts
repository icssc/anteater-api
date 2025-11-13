import { z } from "@hono/zod-openapi";

export const sampleProgramsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "Filter sample programs by program ID and returns all programs if omitted.",
    example: "computerscience_bs",
  }),
});

export const standingyearEnum = z.enum(["Freshman", "Sophomore", "Junior", "Senior"]);

export const courseEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("courseId"),
    value: z.string().openapi({
      description: "Course ID that was validated and found in the database",
      example: "I&CSCI31",
    }),
  }),
  z.object({
    type: z.literal("unknown"),
    value: z.string().openapi({
      description:
        "Original text that could not be validated as a course (e.g., general education requirements)",
      example: "General Education III",
    }),
  }),
]);

export const sampleProgramsYearSchema = z
  .object({
    year: standingyearEnum.openapi({
      description: "Class standing or year level",
    }),
    fall: z.array(courseEntrySchema).openapi({
      description:
        "Courses recommended for Fall term. Each entry is either a validated course ID or descriptive text.",
    }),
    winter: z.array(courseEntrySchema).openapi({
      description:
        "Courses recommended for Winter term. Each entry is either a validated course ID or descriptive text.",
    }),
    spring: z.array(courseEntrySchema).openapi({
      description:
        "Courses recommended for Spring term. Each entry is either a validated course ID or descriptive text.",
    }),
  })
  .openapi({
    example: {
      year: "Freshman",
      fall: [
        { type: "courseId", value: "I&CSCI31" },
        { type: "courseId", value: "MATH2A" },
        { type: "courseId", value: "WRITING40" },
      ],
      winter: [
        { type: "courseId", value: "I&CSCI32" },
        { type: "courseId", value: "MATH2B" },
        { type: "courseId", value: "WRITING50" },
        { type: "unknown", value: "General Education III" },
      ],
      spring: [
        { type: "courseId", value: "I&CSCI33" },
        { type: "courseId", value: "IN4MATX43" },
        { type: "courseId", value: "I&CSCI6B" },
        { type: "courseId", value: "WRITING60" },
      ],
    },
  });

export const sampleProgramVariationSchema = z.object({
  label: z.string().nullable().openapi({
    description:
      "Label describing this variation of the multiple sample programs available for this program",
    example: "General",
  }),
  courses: z.array(sampleProgramsYearSchema).openapi({
    description:
      "Structured list of courses for this variation, organized by year and term. Each course entry indicates whether it was validated as a course ID or kept as descriptive text.",
  }),
  notes: z.array(z.string()).openapi({
    description: "Variation-specific notes (if any)",
    example: [
      "Students are advised that this sample program lists the minimum requirements; it is possible that students may have to take additional courses to prepare for required courses.",
      "The lower-division writing requirement must be completed by the end of the seventh quarter at UCI.",
      "This is only a sample plan. Course offerings may be moved due to unforeseen circumstances. It is strongly recommended that students meet with an academic advisor to create an academic plan tailored to meet their specific areas of interest.",
    ],
  }),
});

export const sampleProgramsResponseSchemaObject = z.object({
  id: z.string().openapi({
    description: "Stable ID for this sample program record",
    example: "computerscience_bs",
  }),
  programName: z.string().openapi({
    description: "Program name of this sample program",
    example: "Computer Science, B.S.",
  }),
  variations: z.array(sampleProgramVariationSchema).openapi({
    description: "Array of program variations. Programs with single variation have empty label.",
  }),
});

export const sampleProgramsResponseSchema = z.array(sampleProgramsResponseSchemaObject);
