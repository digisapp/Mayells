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
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
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
