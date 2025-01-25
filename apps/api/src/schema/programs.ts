import { z } from "@hono/zod-openapi";

const programIdBase = z.string({ required_error: "programId is required" });

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

// one day someone will figure out z.discriminatedUnion
export const programRequirementSchema = z.union([
  programCourseRequirementSchema,
  programUnitRequirementSchema,
  programGroupRequirementSchema,
]);

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
