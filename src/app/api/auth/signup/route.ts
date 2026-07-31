import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { signupSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { ensureUserProfile } from '@/lib/auth/profile';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { success: ipOk } = await rateLimit(`auth:signup:ip:${ip}`, { maxRequests: 10, windowSeconds: 3600, failClosed: true });
    if (!ipOk) {
      return NextResponse.json({ error: 'Too many sign-up attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
    }

    const parsed = signupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { email, password, fullName, role } = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });

    if (error) {
      // Supabase returns a generic message for existing users when confirmation
      // is on; surface its message but never leak internals.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data.user) {
      return NextResponse.json({ error: 'Sign-up failed. Please try again.' }, { status: 400 });
    }

    // With email confirmation on, Supabase "succeeds" for an already-registered
    // email by returning an obfuscated fake user (random id, no identities)
    // instead of an error. Creating/claiming anything for that fake id would
    // corrupt real data — respond exactly like a fresh confirmation-pending
    // signup so account existence isn't leaked either way.
    if (!data.user.identities || data.user.identities.length === 0) {
      return NextResponse.json({ success: true, needsConfirmation: true, role });
    }

    // If email confirmation is required there's no session yet, and the email
    // address is UNPROVEN — anyone can type someone else's address here. Defer
    // profile creation (and especially shadow-seller claiming, which re-points
    // a consignor's lots/payouts) to the confirmation callback / first login,
    // where control of the inbox has been demonstrated.
    const needsConfirmation = !data.session;
    if (!needsConfirmation) {
      // Confirmation is off (or auto-confirmed): they're logged in now, so
      // create the profile immediately. db uses the service-role connection
      // so this works regardless of RLS.
      await ensureUserProfile({ id: data.user.id, email, fullName, role });
    }
    return NextResponse.json({ success: true, needsConfirmation, role });
  } catch (error) {
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
