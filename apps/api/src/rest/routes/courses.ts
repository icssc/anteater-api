import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  batchCoursesQuerySchema,
  courseSchema,
  coursesByCursorQuerySchema,
  coursesPathSchema,
  coursesQuerySchema,
  cursorResponseSchema,
  errorSchema,
  prerequisiteSchema,
  prerequisiteTreeSchema,
  responseSchema,
} from "$schema";
import { CoursesService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const coursesRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });
const coursesCursorRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

coursesRouter.openAPIRegistry.register("prereq", prerequisiteSchema);
coursesRouter.openAPIRegistry.register("prereqTree", prerequisiteTreeSchema);

const batchCoursesRoute = createRoute({
  summary: "Retrieve multiple courses",
  operationId: "batchCourses",
  tags: ["Courses"],
  method: "get",
  path: "/batch",
  request: { query: batchCoursesQuerySchema },
  description:
    "Retrieves information for multiple courses at once using a comma-separated list of course IDs",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(courseSchema.array()) },
      },
      description: "Successfully retrieved the requested courses",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid course IDs format provided",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred while retrieving the courses",
    },
  },
});

const courseByIdRoute = createRoute({
  summary: "Retrieve a course",
  operationId: "courseById",
  tags: ["Courses"],
  method: "get",
  path: "/{id}",
  request: { params: coursesPathSchema },
  description:
    "Retrieves detailed information about a specific course, including its prerequisites, units, description, and other course details.",
  responses: {
    200: {
      content: { "application/json": { schema: responseSchema(courseSchema) } },
      description: "Successfully retrieved the course information",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Course not found with the specified ID",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid course ID format provided",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred while retrieving the course",
    },
  },
});

const coursesByFiltersRoute = createRoute({
  summary: "Filter courses",
  operationId: "coursesByFilters",
  tags: ["Courses"],
  method: "get",
  path: "/",
  request: { query: coursesQuerySchema },
  description:
    "Retrieves courses matching the given filters. Supports filtering by department, course number, title, description, GE category, and more.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(courseSchema.array()) },
      },
      description: "Successfully retrieved the filtered courses",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid filter parameters provided",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred while filtering courses",
    },
  },
});

const coursesByCursorRoute = createRoute({
  summary: "Filter courses with cursor pagination",
  operationId: "coursesByCursor",
  tags: ["Courses"],
  method: "get",
  path: "/",
  request: { query: coursesByCursorQuerySchema },
  description:
    "Retrieves courses matching the given filters with cursor-based pagination. Provides efficient navigation through large result sets.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: cursorResponseSchema(courseSchema.array()),
          example: {
            ok: true,
            data: {
              items: [
                {
                  id: "COMPSCI161",
                  department: "COMPSCI",
                  courseNumber: "161",
                  courseNumeric: 161,
                  school: "Donald Bren School of Information and Computer Sciences",
                  title: "Design and Analysis of Algorithms",
                  courseLevel: "Upper Division (100-199)",
                  minUnits: 4,
                  maxUnits: 4,
                  description:
                    "Design and analysis of algorithms. Complexity analysis, divide and conquer, dynamic programming, greedy algorithms, graph algorithms, randomized algorithms.",
                  departmentName: "Computer Science",
                  instructors: [
                    {
                      ucinetid: "mikes",
                      name: "Michael Shindler",
                      title: "Associate Professor of Teaching",
                      email: "mikes@uci.edu",
                      department: "Computer Science",
                      shortenedNames: ["SHINDLER, M."],
                    },
                  ],
                  prerequisiteTree: {
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
                  prerequisiteText: "Prerequisites: I&C SCI 46 with a grade of C or better",
                  prerequisites: [
                    {
                      id: "I&CSCI46",
                      title: "Data Structure Implementation and Analysis",
                      department: "I&C SCI",
                      courseNumber: "46",
                    },
                  ],
                  dependencies: [
                    {
                      id: "COMPSCI162",
                      title: "Formal Languages and Automata",
                      department: "COMPSCI",
                      courseNumber: "162",
                    },
                  ],
                  repeatability: "May be taken for credit 1 time.",
                  gradingOption: "Letter Grade or Pass/Not Pass",
                  concurrent: "Concurrent with COMPSCI H161",
                  sameAs: "Same as COMPSCI H161",
                  restriction: "School of ICS majors have first consideration for enrollment.",
                  overlap: "Course may not be taken after COMPSCI H161.",
                  corequisites: "Corequisite: MATH 2B",
                  geList: ["GE II: Science and Technology"],
                  geText: "Fulfills General Education II: Science and Technology",
                  terms: ["2024 Spring", "2024 Winter", "2024 Fall"],
                },
              ],
              nextCursor: "eyJpZCI6IkNPTVBTQ0kxNjEifQ==", // Base64 encoded: {"id":"COMPSCI161"}
            },
          },
        },
      },
      description: "Successfully retrieved the paginated course results",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid filter parameters or cursor provided",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred while retrieving courses",
    },
  },
});

coursesRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

coursesRouter.openapi(batchCoursesRoute, async (c) => {
  const { ids } = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: courseSchema.array().parse(await service.batchGetCourses(ids)),
    },
    200,
  );
});

coursesRouter.openapi(courseByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new CoursesService(database(c.env.DB.connectionString));
  const res = await service.getCourseById(id);
  return res
    ? c.json({ ok: true, data: courseSchema.parse(res) }, 200)
    : c.json({ ok: false, message: `Course ${id} not found` }, 404);
});

coursesRouter.openapi(coursesByFiltersRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: courseSchema.array().parse(await service.getCourses(query)),
    },
    200,
  );
});

coursesCursorRouter.openapi(coursesByCursorRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));

  const { items, nextCursor } = await service.getCoursesByCursor(query);
  return c.json(
    {
      ok: true,
      data: {
        items: courseSchema.array().parse(items),
        nextCursor: nextCursor,
      },
    },
    200,
  );
});

export { coursesRouter, coursesCursorRouter };
