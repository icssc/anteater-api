import type { Cache, ResponseCachePluginExtensions } from "@graphql-yoga/plugin-response-cache";
import type { ExecutionResult } from "graphql";

export class YogaKVCache implements Cache {
  constructor(private readonly kv: KVNamespace<string>) {}

  async get(
    key: string,
  ): Promise<ExecutionResult<Record<string, unknown>, ResponseCachePluginExtensions> | undefined> {
    return JSON.parse((await this.kv.get(key, "text")) ?? "null") ?? undefined;
  }

  async set(id: string, data: ExecutionResult, _: unknown, ttl: number): Promise<void> {
    // convert milliseconds (Yoga) to seconds (Cloudflare) and enforce Cloudflare KV minimum of 60 seconds
    const expirationTtl = Math.max(Math.floor(ttl / 1000), 60);
    await this.kv.put(id, JSON.stringify(data), { expirationTtl: expirationTtl });
  }

  // This is a no-op because our API doesn't have mutations.
  invalidate(_: unknown) {}
}
