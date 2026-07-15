import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { tierFromFlags, TIER1_MAX_BID, CARD_MAX_BID } from '@/lib/bidding/verification';
import { logger } from '@/lib/logger';

/**
 * The signed-in bidder's verification status — tier, paddle number, and the
 * bid ceiling that applies. Drives the "verify to bid" UI.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [row] = await db
      .select({
        cardVerifiedAt: users.cardVerifiedAt,
        identityVerifiedAt: users.identityVerifiedAt,
        paddleNumber: users.paddleNumber,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const v = tierFromFlags(!!row?.cardVerifiedAt, !!row?.identityVerifiedAt);

    return NextResponse.json(
      {
        data: {
          tier: v.tier,
          cardVerified: v.cardVerified,
          identityVerified: v.identityVerified,
          maxBidAllowed: v.maxBidAllowed === Number.MAX_SAFE_INTEGER ? null : v.maxBidAllowed,
          paddleNumber: row?.paddleNumber ?? null,
          thresholds: { tier1MaxBid: TIER1_MAX_BID, cardMaxBid: CARD_MAX_BID },
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    logger.error('verification status error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
