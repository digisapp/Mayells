import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loginSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { ensureUserProfile, roleFromMetadata } from '@/lib/auth/profile';

export async function POST(req: NextRequest) {
  try {
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

    // Per-IP limit plus per-email limit (catches distributed attacks across
    // many IPs). Checked in parallel — they're independent Redis round trips.
    const [{ success: ipOk }, { success: emailOk }] = await Promise.all([
      rateLimit(`auth:login:ip:${ip}`, { maxRequests: 10, windowSeconds: 900, failClosed: true }),
      rateLimit(`auth:login:email:${email.toLowerCase()}`, { maxRequests: 10, windowSeconds: 900, failClosed: true }),
    ]);
    if (!ipOk) {
      return NextResponse.json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': '900' } });
    }
    if (!emailOk) {
      return NextResponse.json({ error: 'Too many login attempts for this account. Please try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': '900' } });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
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
        role: roleFromMetadata(data.user.user_metadata?.role),
      });
    } catch (profileError) {
      logger.error('Login: failed to ensure user profile', profileError, { userId: data.user.id });
    }

    // Fetch user role to determine redirect. Uses the pooled DB connection
    // rather than a per-request Supabase REST client — one warm query instead
    // of a cold HTTP round trip on the login critical path.
    let role = 'buyer';
    try {
      const [profile] = await db
        .select({ role: users.role, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, data.user.id))
        .limit(1);
      if (profile?.isAdmin) {
        role = 'admin';
      } else if (profile?.role) {
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
