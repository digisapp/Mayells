/**
 * Next.js instrumentation hook — runs once on server startup.
 * Validates required environment variables before any request is served.
 * A missing variable throws immediately so the deploy fails fast rather
 * than crashing mid-request on the first real user.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    validateEnv();
  }
}
