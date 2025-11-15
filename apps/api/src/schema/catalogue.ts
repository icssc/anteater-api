import { z } from "@hono/zod-openapi";

export const sampleProgramsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "Filter sample programs by program ID and returns all programs if omitted.",
    example: "computerscience_bs",
  }),
});

const STANDING_YEARS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

export const standingYearSchema = z.enum(STANDING_YEARS);

export const courseEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("courseId"),
    value: z.string().openapi({
      description: "A string known to be a valid course ID",
      example: "I&CSCI31",
    }),
  }),
  z.object({
    type: z.literal("unknown"),
    value: z.string().openapi({
      description: "Text that could not be validated",
      example: "Elective",
    }),
  }),
]);

export const sampleProgramsYearSchema = z
  .object({
    year: standingYearSchema.openapi({
      description: "Class standing or year level",
    }),
    fall: z.array(courseEntrySchema),
    winter: z.array(courseEntrySchema),
    spring: z.array(courseEntrySchema),
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
    description: "Label describing this program variation",
    example: "General",
  }),
  courses: z.array(sampleProgramsYearSchema),
  notes: z.array(z.string()).openapi({
    description: "Variation-specific notes (if any)",
    example: [
      "Students are advised that this sample program lists the minimum requirements; it is possible that students may have to take additional courses to prepare for required courses.",
      "The lower-division writing requirement must be completed by the end of the seventh quarter at UCI.",
      "This is only a sample plan. Course offerings may be moved due to unforeseen circumstances. It is strongly recommended that students meet with an academic advisor to create an academic plan tailored to meet their specific areas of interest.",
    ],
  }),
});

export const sampleProgramSchema = z.object({
  id: z.string().openapi({
    description: "Stable ID for this sample program record",
    example: "computerscience_bs",
  }),
  programName: z.string().openapi({
    description: "Program name of this sample program",
    example: "Computer Science, B.S.",
  }),
  variations: z.array(sampleProgramVariationSchema),
});

export const sampleProgramsResponseSchema = z.array(sampleProgramSchema);
