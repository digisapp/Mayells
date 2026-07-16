import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { signupSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { claimShadowUserByEmail } from '@/lib/sellers/shadow';

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

    // Create the profile row. db uses the service-role connection so this works
    // regardless of RLS. onConflictDoNothing tolerates a DB trigger that may
    // already provision the profile from auth.users.
    try {
      await db
        .insert(users)
        .values({ id: data.user.id, email, fullName, role })
        .onConflictDoNothing({ target: users.id });
    } catch (insertError) {
      // A unique-email conflict here means a shadow seller row (a prospect
      // consignor we minted as seller-of-record) already holds this email —
      // Supabase auth would have rejected the signup if a real account owned
      // it. Claim the shadow row so their lots/payouts follow them.
      const claimed = await claimShadowUserByEmail({
        authUserId: data.user.id,
        email,
        fullName,
        role,
      }).catch(() => false);
      if (!claimed) throw insertError;
    }

    // If email confirmation is required, there's no session yet — tell the
    // client to prompt the user to confirm; otherwise they're logged in.
    const needsConfirmation = !data.session;
    return NextResponse.json({ success: true, needsConfirmation, role });
  } catch (error) {
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
