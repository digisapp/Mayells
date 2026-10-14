import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { allowAuthEmail, AUTH_EMAIL_RETRY_AFTER } from '@/lib/auth/attempt-limits';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';

// Reset links must point at OUR canonical origin, never the request's Host
// header — deriving it from the request enables password-reset poisoning
// (attacker-controlled Host puts their domain in the victim's reset email).
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// The response is identical whether or not an account exists for the email,
// so this endpoint can't be used to enumerate registered addresses.
const GENERIC_OK = {
  success: true,
  message: 'If an account exists for that address, a reset link is on its way.',
};

export async function POST(req: NextRequest) {
  try {
    const rejected = rejectCrossSiteAuthRequest(req);
    if (rejected) return rejected;

    const ip = getClientIp(req);

    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const email = parsed.data.email.toLowerCase();

    // Tighter than login: each request sends a real email, so this is both a
    // spam vector and metered Resend spend. Keyed so a stranger can't use up
    // the owner's allowance (see attempt-limits.ts). Fail closed on Redis outage.
    if (!(await allowAuthEmail('forgot', ip, email))) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': AUTH_EMAIL_RETRY_AFTER } },
      );
    }

    const supabase = await createClient();
    // Recovery link → /api/auth/callback verifies it (token_hash template) or
    // exchanges the code (Supabase's default link, which goes via redirectTo)
    // → lands on /reset-password with the user signed in.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${BASE_URL}/api/auth/callback?next=/reset-password`,
    });
    if (error) {
      // Log it, but still return the generic response — error details here
      // (e.g. "user not found" vs. rate limits) would leak account existence.
      logger.error('Password reset email failed', error, { email });
    }

    return NextResponse.json(GENERIC_OK);
  } catch (error) {
    logger.error('Forgot password error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
