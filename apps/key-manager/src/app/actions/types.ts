import { accessControlledResources } from "@packages/key-types";
import { z } from "zod";

export const originSchema = z.httpUrl();
export const formOriginSchema = z.object({ url: originSchema });

const keyFormBaseSchema = z.object({
  name: z.string().min(1).max(30),
  rateLimitOverride: z.number().nonnegative().optional(),
  resources: z.record(z.enum(accessControlledResources), z.boolean()).optional(),
});

export const keyFormSchema = z.discriminatedUnion("_type", [
  keyFormBaseSchema.extend({
    _type: z.literal("publishable"),
    origins: z
      .array(formOriginSchema)
      .min(1, "At least one origin is required for publishable keys")
      .refine((origins) => {
        const urlsSet = new Set();
        for (const [i, origin] of origins.entries()) {
          if (urlsSet.has(origin.url)) {
            return {
              input: origin.url,
              code: "custom",
              message: "Duplicate origins are not allowed",
              path: [i, "url"],
            };
          } else {
            urlsSet.add(origin.url);
          }
        }
      }),
  }),
  keyFormBaseSchema.extend({ _type: z.literal("secret") }),
]);

export const keyStorageBaseSchema = keyFormBaseSchema.extend({
  createdAt: z.coerce.date(),
});

export const keyFormCodec = z.codec(
  keyFormSchema,
  z.discriminatedUnion("_type", [
    keyStorageBaseSchema.extend({
      _type: z.literal("publishable"),
      origins: z.record(originSchema, z.boolean()),
    }),
    keyStorageBaseSchema.extend({ _type: z.literal("secret") }),
  ]),
  {
    decode: (data) => {
      switch (data._type) {
        case "secret":
          return { ...data, createdAt: new Date() };
        case "publishable":
          return {
            ...data,
            createdAt: new Date(),
            origins: Object.fromEntries(
              data.origins.map((origin: z.infer<typeof formOriginSchema>) => [origin.url, true]),
            ) as Record<string, boolean>,
          };
      }
    },
    encode: (data) => ({
      ...data,
      origins:
        data._type === "publishable" ? Object.entries(data.origins).map(([url]) => ({ url })) : [],
    }),
  },
);

export type CreateKeyFormValues = z.infer<typeof keyFormSchema>;
