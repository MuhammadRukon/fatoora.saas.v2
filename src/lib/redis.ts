import { Redis } from '@upstash/redis';

let client: Redis | null | undefined;

/** Upstash REST client, or null when the env vars are unset. Optional layer: callers must fail open. */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
