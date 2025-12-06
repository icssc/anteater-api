import { type KeyData, accessControlledResources } from "@packages/key-types";
import { z } from "zod";

export const createKeySchema = z
  .object({
    _type: z.enum(["publishable", "secret"]),
    name: z.string().min(1).max(30),
    createdAt: z.date(),
    origins: z.array(z.object({ url: z.string() })).optional(),
    rateLimitOverride: z.number().positive().or(z.nan()).optional(),
    resources: z.record(z.enum(accessControlledResources), z.boolean()).optional(),
  })
  .strict();

export const createRefinedKeySchema = createKeySchema.superRefine((data, ctx) => {
  if (data._type === "publishable") {
    if (!data.origins || data.origins.length === 0) {
      ctx.issues.push({
        input: data.origins,
        code: "custom",
        message: "At least one origin is required for publishable keys",
        path: ["origins"],
      });
    } else {
      const urlsSet = new Set();
      data.origins.forEach((origin, index) => {
        if (!origin.url.startsWith("http://") && !origin.url.startsWith("https://")) {
          ctx.issues.push({
            input: origin.url,
            code: "custom",
            message: "Origin URL must use http:// or https://",
            path: ["origins", index, "url"],
          });
        } else {
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
        }
      });
    }
  }
});

const originSchema = z.object({ url: z.string() });

export const createKeyTransform = createKeySchema.transform((data) => {
  return {
    ...data,
    // turn origins from originSchema to Record<string, boolean>
    origins:
      data._type === "publishable"
        ? (Object.fromEntries(
            data.origins?.map((origin: z.infer<typeof originSchema>) => [origin.url, true]) ?? [],
          ) as Record<string, boolean>)
        : undefined,
    rateLimitOverride: data.rateLimitOverride ? data.rateLimitOverride : undefined,
    createdAt: new Date(),
  } as KeyData;
});

export const unprivilegedKeySchema = createKeySchema
  .omit({
    resources: true,
    rateLimitOverride: true,
  })
  .strict();

export type CreateKeyFormValues = z.infer<typeof createKeySchema>;
export type CreateKeyValues = z.infer<typeof createKeyTransform>;
