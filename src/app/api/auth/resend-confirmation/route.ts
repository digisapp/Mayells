import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

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
    const ip = getClientIp(req);

    // Same shape as the reset request: just an email.
    const parsed = forgotPasswordSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const email = parsed.data.email.toLowerCase();

    // Every call sends a real email: tight limits, closed if Redis is down.
    const [{ success: ipOk }, { success: emailOk }] = await Promise.all([
      rateLimit(`auth:resend:ip:${ip}`, { maxRequests: 10, windowSeconds: 3600, failClosed: true }),
      rateLimit(`auth:resend:email:${email}`, { maxRequests: 3, windowSeconds: 3600, failClosed: true }),
    ]);
    if (!ipOk || !emailOk) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
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
