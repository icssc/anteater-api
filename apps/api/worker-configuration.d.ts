// Generated by Wrangler by running `wrangler types --x-include-runtime`

interface Env {
  API_KEYS: KVNamespace;
  GQL_CACHE: KVNamespace;
  CF_ENV: string;
  RATE_LIMITER: DurableObjectNamespace /* DurableObjectRateLimiter */;
  DB: Hyperdrive;
}
