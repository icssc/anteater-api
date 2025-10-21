import { z } from "@hono/zod-openapi";

const programIdBase = z.string({ required_error: "programId is required" });

export const majorsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "The ID of a single major to request, if provided",
    example: "BA-163",
  }),
});

export const minorsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "The ID of a single minor to request, if provided",
    example: "49A",
  }),
});

export const specializationsQuerySchema = z.object({
  majorId: z.string().optional().openapi({
    description: "Only fetch specializations associated with the major with this ID, if provided",
    example: "BS-201",
  }),
});

export const majorRequirementsQuerySchema = z.object({
  programId: programIdBase.openapi({
    description: "A major ID to query requirements for",
    example: "BS-201",
  }),
});

export const minorRequirementsQuerySchema = z.object({
  programId: programIdBase.openapi({
    description: "A minor ID to query requirements for",
    example: "459",
  }),
});

export const specializationRequirementsQuerySchema = z.object({
  programId: programIdBase.openapi({
    description: "A specialization ID to query requirements for",
    example: "BS-201E",
  }),
});

export const UgradRequirementsBlockIds = ["UC", "GE", "CHC4"] as const;

export const ugradRequirementsQuerySchema = z.object({
  id: z.enum(UgradRequirementsBlockIds).openapi({ description: "The requirements block to fetch" }),
});

export const sampleProgramsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "Program ID of this sample program",
    example: "computerscience_bs",
  }),
});

export const programRequirementBaseSchema = z.object({
  label: z.string().openapi({
    description: "Human description of this requirement",
  }),
});

export const programCourseRequirementSchema = programRequirementBaseSchema
  .extend({
    requirementType: z.literal("Course"),
    courseCount: z.number().int().nonnegative().openapi({
      description: "The number of courses from this set demanded by this requirement.",
    }),
    courses: z
      .array(z.string())
      .openapi({ description: "The courses permissible for fulfilling this requirement." }),
  })
  .openapi({
    description:
      "A course requirement; a requirement for some number of courses, not necessarily non-repeatable, from a set.",
    example: {
      requirementType: "Course",
      label: "I&CSci 6N or Math 3A",
      courseCount: 1,
      courses: ["I&CSCI6N", "MATH3A"],
    },
  });

export const programUnitRequirementSchema = programRequirementBaseSchema
  .extend({
    requirementType: z.literal("Unit"),
    unitCount: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: "The number of units needed for this requirement." }),
    courses: z
      .array(z.string())
      .openapi({ description: "The courses permissible for fulfilling this requirement." }),
  })
  .openapi({
    description:
      "A unit requirement; a requirement for some number of units earned from a set of courses.",
    example: {
      label: "8 Units Of DRAMA 101",
      requirementType: "Unit",
      unitCount: 8,
      courses: ["DRAMA101A", "DRAMA101B", "DRAMA101C", "DRAMA101D", "DRAMA101E", "DRAMA101S"],
    },
  });

export const programGroupRequirementSchema: z.ZodType<
  z.infer<typeof programRequirementBaseSchema> & {
    requirementType: "Group";
    requirementCount: number;
    requirements: z.infer<typeof programRequirementSchema>[];
  }
> = programRequirementBaseSchema
  .extend({
    requirementType: z.literal("Group"),
    requirementCount: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: "The number of sub-requirements which must be met." }),
    requirements: z
      .lazy(() => programRequirementSchema)
      .array()
      .openapi({
        description:
          "The collection of sub-requirements permissible for fulfilling this requirement.",
        type: "array",
        items: { $ref: "#/components/schemas/programRequirement" },
      }),
  })
  .openapi({
    description: "A group requirement; a requirement to fulfill some number of sub-requirements.",
    example: {
      label: "Select I&CSCI 31-32-33 or I&CSCI H32-33",
      requirementType: "Group",
      requirementCount: 1,
      requirements: [
        {
          label: "I&CSCI 31, 32, 33",
          requirementType: "Course",
          courseCount: 3,
          courses: ["I&CSCI31", "I&CSCI32", "I&CSCI33"],
        },
        {
          label: "I&CSCI H32, 33",
          requirementType: "Course",
          courseCount: 2,
          courses: ["I&CSCIH32", "I&CSCI33"],
        },
      ],
    },
  });

export const programMarkerRequirementSchema = programRequirementBaseSchema
  .extend({
    requirementType: z.literal("Marker"),
  })
  .openapi({
    description:
      "A rule which must be marked as complete, e.g the fulfillment of GE VIII (foreign language) via high school credit",
    example: {
      label: "Entry Level Writing",
      requirementType: "Marker",
    },
  });

// one day someone will figure out z.discriminatedUnion
export const programRequirementSchema = z.union([
  programCourseRequirementSchema,
  programUnitRequirementSchema,
  programGroupRequirementSchema,
  programMarkerRequirementSchema,
]);

export const majorsResponseSchema = z.array(
  z.object({
    id: z.string().openapi({
      description: "ID of this major",
      example: "BA-014",
    }),
    name: z.string().openapi({
      description: "The human name of this major",
      example: "Computer Science",
    }),
    type: z.string().openapi({
      description: "The type of degree granted by this major",
      examples: ["B.S.", "M.Engr.", "Pharm.D."],
    }),
    division: z.literal("Undergraduate").or(z.literal("Graduate")).openapi({
      description: "The division in which this major is offered",
    }),
    specializations: z.array(z.string()).openapi({
      description:
        "The ID(s) of specialization(s) associated with this major; if any are present, one is mandatory for this major.",
      example: [
        "BS-201A",
        "BS-201B",
        "BS-201C",
        "BS-201D",
        "BS-201E",
        "BS-201F",
        "BS-201G",
        "BS-201H",
        "BS-201I",
      ],
    }),
  }),
);

export const minorsResponseSchema = z.array(
  z.object({
    id: z.string().openapi({
      description: "ID of this minor",
      example: "25F",
    }),
    name: z.string().openapi({
      description: "The human name of this minor",
      example: "Minor in Bioinformatics",
    }),
  }),
);

export const specializationsResponseSchema = z.array(
  z.object({
    id: z.string().openapi({
      description: "ID of this specialization",
      example: "BS-201B",
    }),
    majorId: z.string().openapi({
      description: "Major ID which this specialization is associated with",
      example: "BS-201",
    }),
    name: z.string().openapi({
      description: "The human name of this specialization",
      example: "CS:Specialization in Algorithms",
    }),
  }),
);

export const programRequirementsResponseSchema = z.object({
  id: z.string().openapi({
    description: "Identifier for this program",
  }),
  name: z.string().openapi({
    description: "Human name for this program",
  }),
  requirements: z.array(programRequirementSchema).openapi({
    description:
      "The set of of requirements for this program; a course, unit, or group requirement as follows:",
  }),
});

export const majorRequirementsResponseSchema = programRequirementsResponseSchema.extend({
  id: programRequirementsResponseSchema.shape.id.openapi({ example: "BS-201" }),
  name: programRequirementsResponseSchema.shape.name.openapi({
    example: "Major in Computer Science",
  }),
  schoolRequirements: z
    .object({
      name: z.string().openapi({ description: "Name for this school's requirements" }),
      requirements: programRequirementsResponseSchema.shape.requirements,
    })
    .nullable()
    .openapi({
      description: "If present, requirements imposed by the school this major belongs to",
    }),
});

export const minorRequirementsResponseSchema = programRequirementsResponseSchema.extend({
  id: programRequirementsResponseSchema.shape.id.openapi({ example: "459" }),
  name: programRequirementsResponseSchema.shape.name.openapi({
    example: "Minor in Information and Computer Science",
  }),
});

export const specializationRequirementsResponseSchema = programRequirementsResponseSchema.extend({
  id: programRequirementsResponseSchema.shape.id.openapi({ example: "BS-201E" }),
  name: programRequirementsResponseSchema.shape.name.openapi({
    example: "CS:Specialization in Bioinformatics",
  }),
});

export const ugradRequirementsResponseSchema = z.object({
  id: z.string().openapi({ description: "ID of the requirements block fetched" }),
  requirements: z
    .array(programRequirementSchema)
    .openapi({ description: "The requirements in this requirements block" }),
});

export const sampleProgramsYearSchema = z.object({
  year: z.string().openapi({
    description: "Academic level or year standing",
    example: "Freshman",
  }),
  fall: z.array(z.string()).openapi({
    description: "Courses recommended for Fall term",
    example: ["I&C SCI 31", "MATH 2A", "WRITING 40"],
  }),
  winter: z.array(z.string()).openapi({
    description: "Courses recommended for Winter term",
    example: ["I&C SCI 32", "MATH 2B", "WRITING 50"],
  }),
  spring: z.array(z.string()).openapi({
    description: "Courses recommended for Spring term",
    example: ["I&C SCI 33", "IN4MATX 43", "WRITING 60"],
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
  sampleProgram: z.array(sampleProgramsYearSchema).openapi({
    description: "Structured list of courses for this program, organized by year and term",
    example: [
      {
        year: "Freshman",
        fall: ["I&C SCI 31", "MATH 2A", "WRITING 40"],
        winter: ["I&C SCI 32", "MATH 2B", "WRITING 50", "General Education III"],
        spring: ["I&C SCI 33", "IN4MATX 43", "I&C SCI 6B", "WRITING 60"],
      },
      {
        year: "Sophomore",
        fall: ["I&C SCI 45C", "I&C SCI 51", "I&C SCI 6D"],
        winter: ["I&C SCI 46", "I&C SCI 6N", "General Education III"],
        spring: [
          "Computer Science Spec./Elective",
          "Stats 67",
          "General Education III",
          "Science Elective",
        ],
      },
    ],
  }),
  notes: z.array(z.string()).openapi({
    description: "A list of important notes or footnotes related to this sample program.",
    example: [
      "Students are advised that this sample program lists the minimum requirements...",
      "The lower-division writing requirement must be completed by the end of the seventh quarter at UCI.",
    ],
  }),
});

export const sampleProgramsResponseSchema = z.array(sampleProgramsResponseSchemaObject);
