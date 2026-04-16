import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { loginSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success: ipOk } = await rateLimit(`auth:login:ip:${ip}`, { maxRequests: 10, windowSeconds: 900 });
    if (!ipOk) {
      return NextResponse.json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': '900' } });
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    // Per-email rate limit catches distributed attacks across many IPs
    const { success: emailOk } = await rateLimit(`auth:login:email:${email.toLowerCase()}`, { maxRequests: 10, windowSeconds: 900 });
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

    // Fetch user role to determine redirect (using Supabase admin client, same as middleware)
    let role = 'buyer';
    try {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data: profile } = await adminClient
        .from('users')
        .select('role, is_admin')
        .eq('id', data.user.id)
        .single();
      if (profile?.is_admin) {
        role = 'admin';
      } else if (profile?.role) {
        role = profile.role;
      }
    } catch {
      // lookup failed — default to buyer, login still succeeds
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      session: data.session,
      role,
    });
  } catch (error) {
    logger.error('Login error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
