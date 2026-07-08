import { z } from 'zod';
import { logger } from '@/lib/logger';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  // Required for their respective features to FUNCTION, but optional to BOOT so
  // a deployment can come up (and serve everything else) before these external
  // services are provisioned. Redis powers bidding + anti-snipe; Stripe powers
  // payments. The clients (src/lib/redis.ts, src/lib/stripe/config.ts) surface a
  // clear error at call time if the feature is used while unconfigured, instead
  // of taking the whole server down at startup. Set these before going live with
  // bidding or checkout.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Feature-specific — optional so a deployment that doesn't use LiveKit,
  // xAI/OpenAI, or Shippo still validates, but they're documented here.
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'xai']).optional(),
  XAI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url().optional(),
  SHIPPO_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error('Missing or invalid environment variables', undefined, {
      issues: result.error.format(),
    });
    throw new Error('Invalid environment variables — check server logs for details');
  }
  return result.data;
}

// The subset the edge runtime (middleware) actually dereferences. Validated
// separately so the edge fails fast with a clear message instead of an opaque
// crash on a missing Supabase key, without requiring node-only secrets to be
// present in the edge environment.
const edgeEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function validateEdgeEnv() {
  const result = edgeEnvSchema.safeParse(process.env);
  if (!result.success) {
    logger.error('Missing or invalid edge environment variables', undefined, {
      issues: result.error.format(),
    });
    throw new Error('Invalid edge environment variables — check server logs for details');
  }
  return result.data;
}
