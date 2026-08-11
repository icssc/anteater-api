import { accessControlledResources, type KeyData } from "@packages/key-types";
import { z } from "zod";

export const originSchema = z.httpUrl();
export const formOriginSchema = z.object({ url: originSchema });

const keyBaseSchema = z.object({
  name: z.string().min(1).max(30),
  createdAt: z.date(),
  rateLimitOverride: z.number().positive().optional(),
  resources: z.record(z.enum(accessControlledResources), z.boolean()).optional(),
});

export const createKeyFormSchema = z.discriminatedUnion("_type", [
  keyBaseSchema.extend({
    _type: z.literal("publishable"),
    origins: z
      .array(formOriginSchema)
      .min(1, "At least one origin is required for publishable keys")
      .superRefine((origins, ctx) => {
        const urlsSet = new Set();
        origins.forEach((origin, index) => {
          if (urlsSet.has(origin.url)) {
            ctx.issues.push({
              input: origin.url,
              code: "custom",
              message: "Duplicate origins are not allowed",
              path: ["origins", index, "url"],
            });
          } else {
            urlsSet.add(origin.url);
          }
        });
      }),
  }),
  keyBaseSchema.extend({ _type: z.literal("secret") }),
]);

export const keyStorageCodec = z.codec(
  createKeyFormSchema,
  z.discriminatedUnion("_type", [
    keyBaseSchema.extend({
      _type: z.literal("publishable"),
      origins: z.record(originSchema, z.boolean()),
    }),
    keyBaseSchema.extend({ _type: z.literal("secret") }),
  ]),
  {
    decode: (data) => {
      switch (data._type) {
        case "secret":
          return data;
        case "publishable":
          return {
            ...data,
            origins: Object.fromEntries(
              data.origins.map((origin: z.infer<typeof formOriginSchema>) => [origin.url, true]),
            ) as Record<string, boolean>,
          };
      }
    },
    encode: (data) => ({
      ...data,
      origins:
        data._type === "publishable"
          ? Object.entries(data.origins ?? []).map(([url]) => ({ url }))
          : [],
    }),
  },
);

export const editKeyTransform = createKeyFormSchema.transform(
  (data) =>
    ({
      ...data,
      origins:
        data._type === "publishable"
          ? (Object.fromEntries(
              data.origins?.map((origin: z.infer<typeof formOriginSchema>) => [origin, true]) ?? [],
            ) as Record<string, boolean>)
          : undefined,
      rateLimitOverride: data.rateLimitOverride,
    }) as KeyData,
);

export type CreateKeyFormValues = z.infer<typeof createKeyFormSchema>;
