import { Redis } from '@upstash/redis';

// Whether Redis is actually configured. A recent change made these env vars
// optional so the app can boot without them (local dev), but security-critical
// limiters need to tell "no Redis on purpose (dev)" apart from "Redis is down
// (possible attack/outage)". When configured-but-erroring, cost/abuse-sensitive
// limiters fail CLOSED; when not configured at all, they fail open so dev works.
export const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

if (!isRedisConfigured && process.env.NODE_ENV === 'production') {
  // Loud signal: in production, missing Redis silently disables rate limiting
  // and the bid engine's atomic gate.
  console.error(
    '[redis] UPSTASH_REDIS_REST_URL/TOKEN are not set in production — ' +
      'rate limiting and the bid engine will not function correctly.',
  );
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
});
