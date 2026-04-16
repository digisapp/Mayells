import { redis } from './redis';
import { logger } from './logger';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
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
    // Fail open: if Redis is unavailable, allow the request through rather than
    // taking down the entire API. Log so we know Redis needs attention.
    logger.error('Rate limit Redis error — failing open', err, { key });
    return { success: true, remaining: config.maxRequests, resetAt };
  }
}
