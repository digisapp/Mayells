/**
 * Next.js instrumentation hook — runs once on server startup.
 * Validates required environment variables before any request is served,
 * and initialises Sentry for server-side error tracking.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    const { validateEnv } = await import('@/lib/env');
    validateEnv();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
