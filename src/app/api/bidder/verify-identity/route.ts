import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

/**
 * Start identity verification (Tier 3) for high-value bidding. Creates a Stripe
 * Identity VerificationSession — a hosted, fully-automated government-ID + selfie
 * check. On success the webhook (identity.verification_session.verified) marks
 * the bidder identity-verified, lifting the bid ceiling. `returnTo` sends them
 * back to the lot afterward.
 *
 * Requires Stripe Identity to be enabled on the account.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { success } = await rateLimit(`verify-identity:${getClientIp(req)}`, { maxRequests: 10, windowSeconds: 3600 });
    if (!success) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const rawReturn = typeof body?.returnTo === 'string' ? body.returnTo : '/watchlist';
    // Only allow internal same-origin paths (block open redirects).
    const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/watchlist';

    const [profile] = await db
      .select({ identityVerifiedAt: users.identityVerifiedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (profile?.identityVerifiedAt) {
      return NextResponse.json({ data: { alreadyVerified: true } });
    }

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: user.id, purpose: 'bidder_identity_verification' },
      // Stripe appends ?verification_session_id=...; land back on the lot.
      return_url: `${APP_URL}${returnTo}${returnTo.includes('?') ? '&' : '?'}identity=1`,
    });

    if (!session.url) throw new Error('Stripe did not return an identity verification URL');
    return NextResponse.json({ data: { url: session.url } });
  } catch (error) {
    logger.error('verify-identity error', error);
    return NextResponse.json({ error: 'Unable to start identity verification' }, { status: 500 });
  }
}
