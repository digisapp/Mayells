import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureUserProfile, roleFromMetadata } from '@/lib/auth/profile';
import { logger } from '@/lib/logger';

// Only allow redirects to internal paths (prevent open redirect). Reject
// protocol-relative forms `//host` and `/\host` (some browsers normalize the
// latter to protocol-relative and navigate off-site).
function getSafeRedirect(next: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  return next;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = getSafeRedirect(searchParams.get('next') ?? '/');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Signup deferred profile creation until the email was proven; the
      // confirmation link landing here is that proof. Idempotent, and also
      // claims any shadow seller row (a consignor's lots/payouts minted
      // before they had an account). Never block the login on it.
      const user = data?.user;
      if (user?.email) {
        try {
          await ensureUserProfile({
            id: user.id,
            email: user.email,
            fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
            role: roleFromMetadata(user.user_metadata?.role),
          });
        } catch (profileError) {
          logger.error('Auth callback: failed to ensure user profile', profileError, { userId: user.id });
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
