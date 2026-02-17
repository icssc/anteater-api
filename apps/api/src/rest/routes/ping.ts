import { defaultHook } from "$hooks";
import { response200, response500 } from "$schema";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const pingRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const pingRoute = createRoute({
  summary: "Ping",
  operationId: "ping",
  tags: ["Other"],
  method: "get",
  path: "/",
  description:
    "An endpoint for testing your connectivity to the REST API. This endpoint is never cached, so you can also use it to check your remaining request quota.",
  responses: {
    200: response200(z.literal<string>("Pong!")),
    500: response500(),
  },
});

pingRouter.openapi(pingRoute, async (c) => c.json({ ok: true, data: "Pong!" }, 200));

export { pingRouter };
