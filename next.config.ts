import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        // Only optimize public storage objects, not arbitrary paths on any
        // *.supabase.co host — narrows the image-optimizer SSRF/abuse surface.
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    // Content-Security-Policy. Kept permissive on connect-src/img-src so
    // Supabase Realtime (wss), Stripe, Sentry, Vercel Analytics, LiveKit, and
    // external lot images keep working, while locking down the high-value
    // vectors: only same-origin + Vercel's analytics script may load as script,
    // no framing (clickjacking), no <base> hijacking, forms only post to self,
    // and mixed content is upgraded. 'unsafe-inline' for scripts is required by
    // Next.js without per-request nonces.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self' blob:",
      "media-src 'self' https: blob:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(self), camera=(self)' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress Sentry build output unless SENTRY_DSN is set
  silent: !process.env.SENTRY_DSN,

  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,

  // Upload source maps only when building for production with a DSN
  sourcemaps: {
    disable: !process.env.SENTRY_DSN,
  },

  // Automatically instrument Next.js data fetching methods
  autoInstrumentServerFunctions: true,
});
