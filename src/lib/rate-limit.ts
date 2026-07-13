import { redis, isRedisConfigured } from './redis';
import { logger } from './logger';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  /**
   * When Redis is unavailable: default (false) fails OPEN — allow the request
   * so the whole API doesn't go down with Redis. Set true on cost-sensitive or
   * abuse-prone endpoints (LLM calls, voice tokens) to fail CLOSED instead, so
   * an outage can't be used to bypass the limit and run up third-party spend.
   */
  failClosed?: boolean;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rate:${key}:${Math.floor(now / config.windowSeconds)}`;
  const resetAt = (Math.floor(now / config.windowSeconds) + 1) * config.windowSeconds;

  try {
    const current = await redis.incr(windowKey);

    if (current === 1) {
      await redis.expire(windowKey, config.windowSeconds);
    }

    const remaining = Math.max(0, config.maxRequests - current);

    return {
      success: current <= config.maxRequests,
      remaining,
      resetAt,
    };
  } catch (err) {
    // Distinguish "Redis intentionally absent" (local dev — never configured)
    // from "Redis configured but erroring" (production outage or attack). Only
    // honor failClosed in the latter case, so a dev box with no Redis can still
    // log in / bid, while a metered or brute-force-sensitive endpoint is not
    // left unbounded during a real outage.
    const shouldFailClosed = config.failClosed && isRedisConfigured;
    logger.error(
      `Rate limit Redis error — failing ${shouldFailClosed ? 'closed' : 'open'}`,
      err,
      { key },
    );
    return {
      success: !shouldFailClosed,
      remaining: shouldFailClosed ? 0 : config.maxRequests,
      resetAt,
    };
  }
}
