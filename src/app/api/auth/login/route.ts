import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loginSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { ensureUserProfile } from '@/lib/auth/profile';
import { isAdminProfile } from '@/lib/auth/admin';
import { checkLoginAttempt, recordLoginFailure, LOGIN_RETRY_AFTER } from '@/lib/auth/attempt-limits';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';

export async function POST(req: NextRequest) {
  try {
    const rejected = rejectCrossSiteAuthRequest(req);
    if (rejected) return rejected;

    const ip = getClientIp(req);

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    // Per-IP limit on every attempt; per-account limits on wrong passwords
    // only, so nobody can lock someone else out (see attempt-limits.ts).
    const allowed = await checkLoginAttempt(ip, email);
    if (allowed === 'ip') {
      return NextResponse.json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': LOGIN_RETRY_AFTER } });
    }
    if (allowed === 'account') {
      return NextResponse.json({ error: 'Too many login attempts for this account. Please try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': LOGIN_RETRY_AFTER } });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Supabase's messages ("Invalid login credentials") read like a system
      // log; the codes let the form say what to do next.
      if (error.code === 'email_not_confirmed') {
        return NextResponse.json(
          { error: 'Please confirm your email address first, using the link we sent when you created your account.', code: 'email_not_confirmed' },
          { status: 401 },
        );
      }
      if (error.code === 'invalid_credentials') {
        await recordLoginFailure(ip, email);
        return NextResponse.json({ error: 'That email and password don’t match. Check them and try again.', code: 'invalid_credentials' }, { status: 401 });
      }
      logger.warn('Login failed', { code: error.code, status: error.status });
      return NextResponse.json({ error: 'We couldn’t sign you in just now. Please try again.' }, { status: 401 });
    }

    // A password sign-in proves control of the account, so it's safe to
    // (idempotently) create the deferred profile row and claim any shadow
    // seller row holding this email. Backstop for users who confirmed their
    // email but never passed through the callback. Never blocks the login.
    try {
      await ensureUserProfile({
        id: data.user.id,
        email: data.user.email ?? email,
        fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      });
    } catch (profileError) {
      logger.error('Login: failed to ensure user profile', profileError, { userId: data.user.id });
    }

    // Fetch user role to determine redirect. Uses the pooled DB connection
    // rather than a per-request Supabase REST client — one warm query instead
    // of a cold HTTP round trip on the login critical path. isAdminProfile
    // checks the account status too, so a suspended admin is answered as a
    // buyer and never sent to /admin.
    let role = 'buyer';
    try {
      const [profile] = await db
        .select({ role: users.role, isAdmin: users.isAdmin, accountStatus: users.accountStatus })
        .from(users)
        .where(eq(users.id, data.user.id))
        .limit(1);
      if (isAdminProfile(profile)) {
        role = 'admin';
      } else if (profile?.role && profile.role !== 'admin') {
        role = profile.role;
      }
    } catch {
      // lookup failed — default to buyer, login still succeeds
    }

    // Do NOT return the session/refresh token in the body — the SSR client has
    // already set httpOnly auth cookies. Echoing tokens to client-side JS only
    // widens the XSS blast radius (a stolen refresh token mints new sessions).
    return NextResponse.json({
      success: true,
      role,
    });
  } catch (error) {
    logger.error('Login error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
