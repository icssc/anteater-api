import { defaultHook } from "$hooks";
import type { Bindings } from "$types/bindings";
import { OpenAPIHono } from "@hono/zod-openapi";
import { calendarRouter } from "./routes/calendar";
import { coursesRouter } from "./routes/courses";
import { enrollmentHistoryRouter } from "./routes/enrollment-history";
import { gradesRouter } from "./routes/grades";
import { instructorsRouter } from "./routes/instructors";
import { larcRouter } from "./routes/larc.ts";
import { pingRouter } from "./routes/ping";
import { websocRouter } from "./routes/websoc";
import { weekRouter } from "./routes/week";

const restRouter = new OpenAPIHono<{ Bindings: Bindings }>({ defaultHook });

restRouter.route("/calendar", calendarRouter);
restRouter.route("/courses", coursesRouter);
restRouter.route("/enrollmentHistory", enrollmentHistoryRouter);
restRouter.route("/grades", gradesRouter);
restRouter.route("/instructors", instructorsRouter);
restRouter.route("/ping", pingRouter);
restRouter.route("/websoc", websocRouter);
restRouter.route("/week", weekRouter);
restRouter.route("/larc", larcRouter);

export { restRouter };
