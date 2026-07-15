import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

/**
 * Start card-on-file verification. Creates a Stripe Checkout session in `setup`
 * mode — this authorizes and saves a card WITHOUT charging it, and runs it
 * through Stripe Radar. On completion the webhook marks the bidder card-verified
 * and assigns a paddle number. `returnTo` lets us send the bidder back to the
 * lot they were trying to bid on.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { success } = await rateLimit(`verify-card:${getClientIp(req)}`, { maxRequests: 10, windowSeconds: 3600 });
    if (!success) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const rawReturn = typeof body?.returnTo === 'string' ? body.returnTo : '/watchlist';
    // Only allow internal same-origin paths (block open redirects).
    const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/watchlist';

    const [profile] = await db
      .select({ email: users.email, stripeCustomerId: users.stripeCustomerId, cardVerifiedAt: users.cardVerifiedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (profile?.cardVerifiedAt) {
      return NextResponse.json({ data: { alreadyVerified: true } });
    }

    // Ensure the bidder has a Stripe customer so the saved card is reusable.
    // The idempotency key makes concurrent verify-card calls (double-click / two
    // tabs) return the SAME customer instead of creating duplicates and racing
    // on the stripeCustomerId write (which would orphan the card on the losing
    // customer). The conditional update below also never overwrites an existing id.
    let customerId = profile?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: profile?.email || user.email || undefined,
          metadata: { userId: user.id },
        },
        { idempotencyKey: `bidder-customer:${user.id}` },
      );
      customerId = customer.id;
      await db
        .update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(and(eq(users.id, user.id), isNull(users.stripeCustomerId)));
      // Re-read in case a concurrent request won the write — always use the
      // persisted customer so the setup session attaches to the right one.
      const [fresh] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (fresh?.stripeCustomerId) customerId = fresh.stripeCustomerId;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      currency: 'usd',
      payment_method_types: ['card'],
      // The webhook keys verification off these.
      metadata: { userId: user.id, purpose: 'bidder_card_verification' },
      setup_intent_data: { metadata: { userId: user.id, purpose: 'bidder_card_verification' } },
      success_url: `${APP_URL}${returnTo}${returnTo.includes('?') ? '&' : '?'}verified=1`,
      cancel_url: `${APP_URL}${returnTo}`,
    });

    if (!session.url) throw new Error('Stripe did not return a setup URL');
    return NextResponse.json({ data: { url: session.url } });
  } catch (error) {
    logger.error('verify-card error', error);
    return NextResponse.json({ error: 'Unable to start verification' }, { status: 500 });
  }
}
