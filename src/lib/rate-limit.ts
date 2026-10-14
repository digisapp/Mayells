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
  /** How much this call uses up (default 1), e.g. the number of files in a batch. */
  cost?: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCRBY', KEYS[1], tonumber(ARGV[2]))
if current == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

const PEEK_SCRIPT = `
return tonumber(redis.call('GET', KEYS[1]) or '0')
`;

/** The fixed window `key` falls in right now; rateLimit and peekRateLimit share it. */
function currentWindow(key: string, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const index = Math.floor(now / windowSeconds);
  return { windowKey: `rate:${key}:${index}`, resetAt: (index + 1) * windowSeconds };
}

/** Same outage policy as rateLimit: see `failClosed`. */
function redisErrorResult(key: string, config: RateLimitConfig, resetAt: number, err: unknown): RateLimitResult {
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

export async function rateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { windowKey, resetAt } = currentWindow(key, config.windowSeconds);

  try {
    // INCR + EXPIRE in one atomic script: a crash/timeout between two separate
    // round-trips would otherwise leave a counter with no TTL (a key that
    // never expires and keeps counting).
    const current = Number(
      await redis.eval(RATE_LIMIT_SCRIPT, [windowKey], [config.windowSeconds, Math.max(1, Math.floor(config.cost ?? 1))]),
    );

    const remaining = Math.max(0, config.maxRequests - current);

    return {
      success: current <= config.maxRequests,
      remaining,
      resetAt,
    };
  } catch (err) {
    return redisErrorResult(key, config, resetAt, err);
  }
}

/**
 * Check a counter without adding to it: `success` while fewer than
 * `maxRequests` uses are on it this window. Pair with rateLimit() to count
 * only some outcomes, e.g. peek before a sign-in and count it only if the
 * password was wrong, so a stranger's guesses can't lock the owner out.
 */
export async function peekRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { windowKey, resetAt } = currentWindow(key, config.windowSeconds);

  try {
    const current = Number(await redis.eval(PEEK_SCRIPT, [windowKey], []));
    return {
      success: current < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - current),
      resetAt,
    };
  } catch (err) {
    return redisErrorResult(key, config, resetAt, err);
  }
}
