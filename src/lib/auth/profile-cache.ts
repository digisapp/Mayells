/**
 * Key of the middleware's short-lived role/MFA cache for a user. Shared with
 * the routes that must invalidate it (MFA enroll/unenroll) so a change takes
 * effect immediately instead of after the cache TTL.
 */
export const PROFILE_CACHE_SECONDS = 300;
export const profileCacheKey = (userId: string) => `mw:profile:${userId}`;
