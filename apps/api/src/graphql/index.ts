import type { GraphQLContext } from "$graphql/graphql-context";
import { YogaKVCache } from "$graphql/plugins";
import { resolvers } from "$graphql/resolvers";
import { typeDefs } from "$graphql/schema";
import type { Bindings } from "$types/bindings";
import { EnvelopArmorPlugin } from "@escape.tech/graphql-armor";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { database } from "@packages/db";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";

const graphqlRouter = new Hono<{ Bindings: Bindings }>();

graphqlRouter.use("*", async (c) => {
  const context = { db: database(c.env.DB.connectionString), honoContext: c };
  const yoga = createYoga<GraphQLContext>({
    context,
    maskedErrors: false,
    plugins: [
      EnvelopArmorPlugin({ blockFieldSuggestion: { enabled: false }, maxDepth: { n: 8 } }),
      c.env.CF_ENV === "prod"
        ? useResponseCache({
            cache: new YogaKVCache(c.env.GQL_CACHE),
            session: () => null,
          })
        : {},
    ],
    schema: createSchema({ typeDefs, resolvers }),
  });
  return yoga.fetch(c.req.raw, context);
});

export { graphqlRouter };
