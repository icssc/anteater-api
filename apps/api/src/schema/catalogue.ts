import { z } from "@hono/zod-openapi";

export const sampleProgramsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "Filter sample programs by program ID and returns all programs if omitted.",
    example: "computerscience_bs",
  }),
});

export const standingyearEnum = z.enum(["Freshman", "Sophomore", "Junior", "Senior"]);

export const sampleProgramsYearSchema = z
  .object({
    year: standingyearEnum.openapi({
      description: "Class standing or year level",
    }),
    fall: z.array(z.string()).openapi({
      description: "Courses recommended for Fall term",
    }),
    winter: z.array(z.string()).openapi({
      description: "Courses recommended for Winter term",
    }),
    spring: z.array(z.string()).openapi({
      description: "Courses recommended for Spring term",
    }),
  })
  .openapi({
    example: {
      year: "Freshman",
      fall: ["I&CSCI31", "MATH2A", "WRITING40"],
      winter: ["I&CSCI32", "MATH2B", "WRITING50", "General Education III"],
      spring: ["I&CSCI33", "IN4MATX43", "I&CSCI6B", "WRITING60"],
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
      "Structured list of courses for this variation, organized by year and term. Course IDs areare included wherever possible, based on best available mapping.",
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
