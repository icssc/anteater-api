import { z } from "@hono/zod-openapi";
import type { PrerequisiteTree } from "@packages/db/schema";
import { instructorPreviewSchema } from "./instructors";

const inputCourseLevels = ["LowerDiv", "UpperDiv", "Graduate"] as const;

const inputGECategories = [
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

export const outputCourseLevels = [
  "Lower Division (1-99)",
  "Upper Division (100-199)",
  "Graduate/Professional Only (200+)",
] as const;

export const outputGECategories = [
  "GE Ia: Lower Division Writing",
  "GE Ib: Upper Division Writing",
  "GE II: Science and Technology",
  "GE III: Social & Behavioral Sciences",
  "GE IV: Arts and Humanities",
  "GE Va: Quantitative Literacy",
  "GE Vb: Formal Reasoning",
  "GE VI: Language Other Than English",
  "GE VII: Multicultural Studies",
  "GE VIII: International/Global Issues",
] as const;

export const coursesPathSchema = z.object({
  id: z.string().openapi({
    param: { name: "id", in: "path" },
    description: "The unique identifier of the course",
    example: "COMPSCI161",
  }),
});

export const batchCoursesQuerySchema = z.object({
  ids: z
    .string()
    .transform((xs) => xs.split(","))
    .openapi({
      description: "The comma-separated list of course IDs to retrieve",
      example: "COMPSCI161,COMPSCI162",
    }),
});

export const coursesQuerySchema = z.object({
  department: z.string().optional().openapi({
    description: "The academic department offering the course",
    example: "COMPSCI",
  }),
  courseNumber: z.string().optional().openapi({
    description: "The course number to search for",
    example: "161",
  }),
  courseNumeric: z.coerce.number().optional().openapi({
    description: "The numeric portion of the course number for range queries",
    example: 161,
  }),
  titleContains: z.string().optional().openapi({
    description: "The text to search for in course titles",
    example: "Algorithm",
  }),
  courseLevel: z
    .enum(inputCourseLevels, {
      message: "If provided, 'courseLevel' must be 'LowerDiv', 'UpperDiv', or 'Graduate'",
    })
    .optional()
    .openapi({
      description: "The academic level of the course",
      example: "UpperDiv",
    }),
  minUnits: z.coerce.number().optional().openapi({
    description: "The minimum number of units for the course",
    example: 4,
  }),
  maxUnits: z.coerce.number().optional().openapi({
    description: "The maximum number of units for the course",
    example: 4,
  }),
  descriptionContains: z.string().optional().openapi({
    description: "The text to search for in course descriptions",
    example: "algorithms",
  }),
  geCategory: z
    .enum(inputGECategories, {
      message:
        "If provided, 'geCategory' must be one of 'GE-1A', 'GE-1B', 'GE-2', 'GE-3', 'GE-4', 'GE-5A', 'GE-5B', 'GE-6', 'GE-7', or 'GE-8'",
    })
    .optional()
    .openapi({
      description: "The General Education category fulfilled by the course",
      example: "GE-2",
    }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({
      description: "The number of results to return (max 100)",
      example: 50,
    }),
  skip: z.coerce.number().default(0).openapi({
    description: "The number of results to skip for pagination",
    example: 0,
  }),
});

export const coursesByCursorQuerySchema = z.object({
  department: z.string().optional().openapi({
    description: "The academic department offering the course",
    example: "COMPSCI",
  }),
  courseNumber: z.string().optional().openapi({
    description: "The course number to search for",
    example: "161",
  }),
  courseNumeric: z.coerce.number().optional().openapi({
    description: "The numeric portion of the course number for range queries",
    example: 161,
  }),
  titleContains: z.string().optional().openapi({
    description: "The text to search for in course titles",
    example: "Algorithm",
  }),
  courseLevel: z.enum(inputCourseLevels).optional().openapi({
    description: "The academic level of the course",
    example: "UpperDiv",
  }),
  minUnits: z.coerce.number().optional().openapi({
    description: "The minimum number of units for the course",
    example: 4,
  }),
  maxUnits: z.coerce.number().optional().openapi({
    description: "The maximum number of units for the course",
    example: 4,
  }),
  descriptionContains: z.string().optional().openapi({
    description: "The text to search for in course descriptions",
    example: "algorithms",
  }),
  geCategory: z.enum(inputGECategories).optional().openapi({
    description: "The General Education category fulfilled by the course",
    example: "GE-2",
  }),
  cursor: z.string().optional().openapi({
    description: "The pagination cursor from the previous response. Omit for first page",
    example: "eyJpZCI6IkNPTVBTQ0kxNjEifQ==", // Base64 encoded: {"id":"COMPSCI161"}
  }),
  take: z.coerce
    .number()
    .lte(100, "Page size must be less than or equal to 100")
    .default(100)
    .openapi({
      description: "The number of results to return (max 100)",
      example: 50,
    }),
});

export const prerequisiteSchema = z.union([
  z.object({
    prereqType: z.literal("course"),
    coreq: z.literal(false),
    courseId: z.string(),
    minGrade: z.string().optional(),
  }),
  z.object({
    prereqType: z.literal("course"),
    coreq: z.literal(true),
    courseId: z.string(),
  }),
  z.object({
    prereqType: z.literal("exam"),
    examName: z.string(),
    minGrade: z.string().optional(),
  }),
]);

export const prerequisiteTreeSchema: z.ZodType<PrerequisiteTree> = z.object({
  AND: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "All of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
  OR: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "At least one of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
  NOT: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "None of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
});

export const coursePreviewSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
});

export const courseSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
  courseNumeric: z.number().int().openapi({ example: 161 }),
  school: z.string().openapi({
    example: "Donald Bren School of Information and Computer Sciences",
  }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  courseLevel: z.enum(outputCourseLevels).openapi({
    example: "Upper Division (100-199)",
  }),
  minUnits: z.number().openapi({ example: 4 }),
  maxUnits: z.number().openapi({ example: 4 }),
  description: z.string().openapi({
    example:
      "Design and analysis of algorithms. Complexity analysis, divide and conquer, dynamic programming, greedy algorithms, graph algorithms, randomized algorithms.",
  }),
  departmentName: z.string().openapi({ example: "Computer Science" }),
  instructors: z.array(
    instructorPreviewSchema.openapi({
      example: [
        {
          ucinetid: "mikes",
          name: "Michael Shindler",
          title: "Associate Professor of Teaching",
          email: "mikes@uci.edu",
          department: "Computer Science",
          shortenedNames: ["SHINDLER, M."],
        },
      ],
    }),
  ),
  prerequisiteTree: prerequisiteTreeSchema.openapi({
    example: {
      AND: [
        {
          prereqType: "course",
          coreq: false,
          courseId: "I&CSCI46",
          minGrade: "C",
        },
      ],
      OR: [
        {
          prereqType: "course",
          coreq: false,
          courseId: "COMPSCI46",
          minGrade: "C",
        },
      ],
      NOT: [
        {
          prereqType: "course",
          coreq: false,
          courseId: "COMPSCI162",
          minGrade: "D",
        },
      ],
    },
  }),
  prerequisiteText: z.string().openapi({
    example: "Prerequisites: I&C SCI 46 with a grade of C or better",
  }),
  prerequisites: z.array(coursePreviewSchema).openapi({
    example: [
      {
        id: "I&CSCI46",
        title: "Data Structure Implementation and Analysis",
        department: "I&C SCI",
        courseNumber: "46",
      },
    ],
  }),
  dependencies: z.array(coursePreviewSchema).openapi({
    example: [
      {
        id: "COMPSCI162",
        title: "Formal Languages and Automata",
        department: "COMPSCI",
        courseNumber: "162",
      },
    ],
  }),
  repeatability: z.string().openapi({
    example: "May be taken for credit 1 time.",
  }),
  gradingOption: z.string().openapi({
    example: "Letter Grade or Pass/Not Pass",
  }),
  concurrent: z.string().openapi({
    example: "Concurrent with COMPSCI H161",
  }),
  sameAs: z.string().openapi({
    example: "Same as COMPSCI H161",
  }),
  restriction: z.string().openapi({
    example: "School of ICS majors have first consideration for enrollment.",
  }),
  overlap: z.string().openapi({
    example: "Course may not be taken after COMPSCI H161.",
  }),
  corequisites: z.string().openapi({
    example: "Corequisite: MATH 2B",
  }),
  geList: z.array(z.enum(outputGECategories)).openapi({
    example: ["GE II: Science and Technology"],
  }),
  geText: z.string().openapi({
    example: "Fulfills General Education II: Science and Technology",
  }),
  terms: z.array(z.string()).openapi({
    example: ["2024 Fall", "2024 Winter", "2024 Spring"],
  }),
});

// Define the cursor response schema for courses
export const coursesByCursorResponseSchema = z.object({
  ok: z.literal(true).openapi({
    description: "Indicates if the request was successful",
    example: true,
  }),
  data: z
    .object({
      items: z.array(courseSchema),
      nextCursor: z.string().nullable().openapi({
        description:
          "Base64 encoded cursor containing the ID of the last item. Use this to fetch the next page. Null if there are no more results.",
        example: "eyJpZCI6IkNPTVBTQ0kxNjIifQ==", // Base64 encoded: {"id":"COMPSCI162"}
      }),
    })
    .openapi({
      description: "Paginated list of courses with cursor-based navigation",
    }),
});
