import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ensureUserProfile } from '@/lib/auth/profile';
import { safeNext } from '@/lib/auth/safe-next';
import { emailLinkDestination, emailOtpType } from '@/lib/auth/email-link';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { logger } from '@/lib/logger';

const confirmSchema = z.object({
  tokenHash: z.string().min(1).max(512),
  type: z.string(),
  next: z.string().max(2000).optional(),
});

/**
 * POST /api/auth/confirm — spends an emailed sign-up or password-reset link
 * (`token_hash`) and signs this browser in. Called by the Continue button on
 * /auth/confirm, never by the link itself: a same-site JSON POST is what keeps
 * a forwarded link from signing someone into the sender's account.
 */
export async function POST(req: NextRequest) {
  try {
    const rejected = rejectCrossSiteAuthRequest(req);
    if (rejected) return rejected;

    const { success: allowed } = await rateLimit(`auth:confirm:ip:${getClientIp(req)}`, {
      maxRequests: 20,
      windowSeconds: 900,
      failClosed: true,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 });
    }

    const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
    const type = emailOtpType(parsed.success ? parsed.data.type : null);
    if (!parsed.success || !type) {
      return NextResponse.json({ error: 'This link is incomplete. Open it again from the email.' }, { status: 400 });
    }
    const next = safeNext(parsed.data.next);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: parsed.data.tokenHash });
    if (error || !data.user) {
      logger.warn('Email link not accepted', { type, code: error?.code, status: error?.status });
      return NextResponse.json({ error: 'expired', type }, { status: 410 });
    }

    // Signup deferred profile creation until the email was proven; this is
    // that proof. Idempotent, and claims any shadow seller row. Never block
    // the sign-in on it.
    const user = data.user;
    if (user.email) {
      try {
        await ensureUserProfile({
          id: user.id,
          email: user.email,
          fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
        });
      } catch (profileError) {
        logger.error('Email link: failed to ensure user profile', profileError, { userId: user.id });
      }
    }

    return NextResponse.json({ redirect: emailLinkDestination(type, next) });
  } catch (error) {
    logger.error('Email link confirm error', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
