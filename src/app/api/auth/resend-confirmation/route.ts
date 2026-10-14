import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { allowAuthEmail, AUTH_EMAIL_RETRY_AFTER } from '@/lib/auth/attempt-limits';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';

// Answers the same whether or not the address has an unconfirmed account,
// so this can't be used to find out which emails are registered.
const GENERIC_OK = {
  success: true,
  message: 'If that address is waiting to be confirmed, a new link is on its way.',
};

/**
 * Send a fresh sign-up confirmation link, for someone who can't sign in
 * because the first one expired or went missing.
 */
export async function POST(req: NextRequest) {
  try {
    const rejected = rejectCrossSiteAuthRequest(req);
    if (rejected) return rejected;

    const ip = getClientIp(req);

    // Same shape as the reset request: just an email.
    const parsed = forgotPasswordSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const email = parsed.data.email.toLowerCase();

    // Every call sends a real email: tight limits, closed if Redis is down,
    // keyed so a stranger can't use up the owner's allowance.
    if (!(await allowAuthEmail('resend', ip, email))) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': AUTH_EMAIL_RETRY_AFTER } },
      );
    }

    const supabase = await createClient();
    // No emailRedirectTo, matching the original sign-up email.
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      // Logged, but the reply stays generic: "already confirmed" or "no such
      // user" would tell a caller whether the address is registered.
      logger.warn('Confirmation resend failed', { code: error.code, status: error.status });
    }

    return NextResponse.json(GENERIC_OK);
  } catch (error) {
    logger.error('Confirmation resend error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
