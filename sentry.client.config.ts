import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of sessions for performance monitoring in prod, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Only enable in production to avoid noise during development
  enabled: process.env.NODE_ENV === 'production',

  // Strip PII from error reports
  beforeSend(event) {
    if (event.request?.cookies) {
      event.request.cookies = {};
    }
    return event;
  },
});
