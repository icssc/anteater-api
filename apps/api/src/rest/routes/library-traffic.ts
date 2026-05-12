import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import {
	libraryTrafficQuerySchema,
	libraryTrafficSchema,
	response200,
	response404,
	response422,
	response500,
} from "$schema";
import { LibraryTrafficService } from "$services";

const libraryTrafficRouter = new OpenAPIHono<{ Bindings: Env }>({
	defaultHook,
});

const libraryTrafficRoute = createRoute({
	summary: "Retrieve latest library traffic data",
	operationId: "libraryTraffic",
	tags: ["Library Traffic"],
	method: "get",
	path: "/",
	request: { query: libraryTrafficQuerySchema },
	description:
		"Retrieves latest library occupancy metrics for specific locations",
	responses: {
		200: response200(libraryTrafficSchema),
		400: response404("No matching data found for provided parameters"),
		422: response422(),
		500: response500(),
	},
});

libraryTrafficRouter.openapi(libraryTrafficRoute, async (c) => {
	const query = c.req.valid("query");
	const service = new LibraryTrafficService(
		database(c.env.DB.connectionString),
	);
	const res = await service.getLibraryTraffic(query);

	if (res.length === 0) {
		return c.json(
			{
				ok: false,
				message: "Library traffic data not found: check for typos in query",
			},
			400,
		);
	}

	return c.json({ ok: true, data: libraryTrafficSchema.parse(res) }, 200);
});

export { libraryTrafficRouter };
