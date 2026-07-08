import { redis } from './redis';
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
    // If Redis is unavailable, fail open by default (don't take down the whole
    // API), but fail closed for endpoints that opt in — better to reject than
    // to leave a metered/expensive endpoint unbounded during an outage.
    logger.error(
      `Rate limit Redis error — failing ${config.failClosed ? 'closed' : 'open'}`,
      err,
      { key },
    );
    return {
      success: !config.failClosed,
      remaining: config.failClosed ? 0 : config.maxRequests,
      resetAt,
    };
  }
}
