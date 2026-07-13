import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { signupSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

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

    // Create the profile row. db uses the service-role connection so this works
    // regardless of RLS. onConflictDoNothing tolerates a DB trigger that may
    // already provision the profile from auth.users.
    await db
      .insert(users)
      .values({ id: data.user.id, email, fullName, role })
      .onConflictDoNothing({ target: users.id });

    // If email confirmation is required, there's no session yet — tell the
    // client to prompt the user to confirm; otherwise they're logged in.
    const needsConfirmation = !data.session;
    return NextResponse.json({ success: true, needsConfirmation, role });
  } catch (error) {
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
