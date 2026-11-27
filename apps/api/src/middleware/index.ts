import type { KeyData } from "@packages/key-types";

export interface Variables {
  key?: {
    key: string;
    keyData: KeyData;
  };
}

export type HonoEnvironment = { Bindings: Env; Variables: Variables };

export * from "./access-controller";
export * from "./global-rate-limiter";
export * from "./header-injector";
export * from "./ip-based-rate-limiter";
export * from "./key-verifier";
export * from "./openapi-meta";
export * from "./production-cache";
export * from "./redirect-browser-to-docs";
export * from "./reference-og-tag-injector";
