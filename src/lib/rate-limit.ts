import { redis } from './redis';

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

  const current = await redis.incr(windowKey);

  if (current === 1) {
    await redis.expire(windowKey, config.windowSeconds);
  }

  const remaining = Math.max(0, config.maxRequests - current);
  const resetAt = (Math.floor(now / config.windowSeconds) + 1) * config.windowSeconds;

  return {
    success: current <= config.maxRequests,
    remaining,
    resetAt,
  };
}
