import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV === 'production',

  // Don't attach default PII (IP, cookies, headers) to events.
  sendDefaultPii: false,

  beforeSend(event) {
    // Scrub anything that could carry secrets or PII: cookies, auth headers,
    // and request bodies captured by server-function instrumentation.
    if (event.request) {
      event.request.cookies = {};
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }
      delete event.request.data;
    }
    return event;
  },
});
