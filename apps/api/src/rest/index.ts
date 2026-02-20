import { defaultHook } from "$hooks";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apExamsRouter } from "./routes/ap-exams.ts";
import { calendarRouter } from "./routes/calendar";
import { catalogueRouter } from "./routes/catalogue.ts";
import { coursesCursorRouter, coursesRouter } from "./routes/courses";
import { enrollmentHistoryRouter } from "./routes/enrollment-history";
import { gradesRouter } from "./routes/grades";
import { instructorsCursorRouter, instructorsRouter } from "./routes/instructors";
import { larcRouter } from "./routes/larc.ts";
import { libraryTrafficRouter } from "./routes/library-traffic";
import { pingRouter } from "./routes/ping";
import { programsRouter } from "./routes/programs.ts";
import { searchRouter } from "./routes/search";
import { studyRoomsRouter } from "./routes/study-rooms";
import { websocRouter } from "./routes/websoc";
import { weekRouter } from "./routes/week";

const restRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

restRouter.route("/apExams", apExamsRouter);
restRouter.route("/calendar", calendarRouter);
restRouter.route("/courses", coursesRouter);
restRouter.route("/coursesCursor", coursesCursorRouter);
restRouter.route("/enrollmentHistory", enrollmentHistoryRouter);
restRouter.route("/grades", gradesRouter);
restRouter.route("/instructors", instructorsRouter);
restRouter.route("/instructorsCursor", instructorsCursorRouter);
restRouter.route("/larc", larcRouter);
restRouter.route("/libraryTraffic", libraryTrafficRouter);
restRouter.route("/ping", pingRouter);
restRouter.route("/programs", programsRouter);
restRouter.route("/catalogue", catalogueRouter);
restRouter.route("/search", searchRouter);
restRouter.route("/studyRooms", studyRoomsRouter);
restRouter.route("/websoc", websocRouter);
restRouter.route("/week", weekRouter);

export { restRouter };
