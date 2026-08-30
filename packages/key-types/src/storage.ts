import { z } from "zod";
import type { KeyData } from "./index.ts";

type Exact<T, Allowed extends PropertyKey> = T & Record<Exclude<keyof T, Allowed>, never>;
type KeyInStorageSpec<T> = { schema: T; toMemory: (inStorage: z.infer<T>) => KeyData };

function defineEntry<
  Version extends string,
  Repr extends {
    metadata: z.ZodObject<{ v: z.ZodLiteral<Version> } & z.ZodRawShape>;
    value: z.ZodTypeAny;
  },
>(entry: {
  // there are to be no other keys (because we could not possibly store them)
  schema: Exact<Repr, "metadata" | "value">;
  toMemory: (inStorage: z.infer<z.ZodObject<Repr>>) => KeyData;
}): KeyInStorageSpec<z.ZodObject<Repr>> {
  return { schema: z.object(entry.schema), toMemory: entry.toMemory } as KeyInStorageSpec<
    z.ZodObject<Repr>
  >;
}

function buildRegistry<
  Registry extends {
    [Tag in string]: ReturnType<typeof defineEntry>;
  },
>(registry: Registry) {
  for (const key in registry) {
    const v = registry[key].schema.shape.metadata.shape.v.value;
    if (v !== key) {
      throw new Error(`registry id "${key}" must match schema discriminator "${v}"`);
    }
  }
  return registry;
}

const keyInStorageSpecs = buildRegistry({
  v1: defineEntry({
    schema: {
      metadata: z.object({
        // flimsy type inference; do NOT upcast "v1"!
        v: z.literal("v1"),
      }),
      value: z.intersection(
        z.object({
          name: z.string(),
          createdAt: z.coerce.date(),
          rateLimitOverride: z.int().nonnegative().optional(),
          resources: z.record(z.literal("FUZZY_SEARCH"), z.boolean()).optional(),
          owner: z.string(),
        }),
        z.discriminatedUnion("_type", [
          z.object({
            _type: z.literal("secret"),
          }),
          z.object({
            _type: z.literal("publishable"),
            origins: z.record(z.string(), z.boolean()),
          }),
        ]),
      ),
    },
    toMemory(inStorage) {
      // this value is identical to the repr we currently expect
      // in the future, another value can be converted trivially,
      // and this conversion will need to be revised to port this data forward
      return inStorage.value;
    },
  }),
  // to add new spec: define shape with version tag, define toMemory conversion
});

export type KeyInStorage = z.infer<
  (typeof keyInStorageSpecs)[keyof typeof keyInStorageSpecs]["schema"]
>;

// the conversion from data in memory to storage format
export function keyToStorage(_keyId: string | undefined, key: KeyData): KeyInStorage {
  // any supported format could be used, but the latest format is probably most expressive
  return {
    metadata: {
      v: "v1",
    },
    value: key,
  };
}

// the conversion from storage to in-memory format
export function keyToMemory(inStorage: KeyInStorage): KeyData {
  const spec = keyInStorageSpecs[inStorage.metadata.v];
  return spec.toMemory(spec.schema.parse(inStorage));
}
