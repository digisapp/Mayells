import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureUserProfile } from '@/lib/auth/profile';
import { logger } from '@/lib/logger';
import { safeNext } from '@/lib/auth/safe-next';
import { emailLinkConfirmPath, emailOtpType } from '@/lib/auth/email-link';

/**
 * Where Supabase's default auth links land (sign-up confirmation, password
 * reset).
 *
 * - `?code=…`: exchanged for a session, which needs the PKCE verifier cookie,
 *   so only works in the browser that asked for the email. Kept for links
 *   already sent and the default templates.
 * - `?token_hash=…&type=…` (the templates in docs/AUTH_EMAIL_TEMPLATES.md
 *   point at /auth/confirm directly): never verified on this GET — a link
 *   anyone can forward must not sign the opener into the sender's account —
 *   but passed on to the confirm page, where pressing Continue spends it.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = emailOtpType(searchParams.get('type'));
  // Internal paths only (prevents an open redirect).
  const next = safeNext(searchParams.get('next') ?? undefined);

  if (tokenHash && type) {
    return NextResponse.redirect(`${origin}${emailLinkConfirmPath(tokenHash, type, next)}`);
  }

  let user: User | null = null;
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  }

  if (user) {
    // Signup deferred profile creation until the email was proven; the
    // confirmation link landing here is that proof. Idempotent, and also
    // claims any shadow seller row (a consignor's lots/payouts minted
    // before they had an account). Never block the login on it.
    if (user.email) {
      try {
        await ensureUserProfile({
          id: user.id,
          email: user.email,
          fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
        });
      } catch (profileError) {
        logger.error('Auth callback: failed to ensure user profile', profileError, { userId: user.id });
      }
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // A password-reset link that is used or expired: the reset page, finding
  // no session, explains and offers a new link.
  if (type === 'recovery' || new URL(next, origin).pathname === '/reset-password') {
    return NextResponse.redirect(`${origin}/reset-password`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
