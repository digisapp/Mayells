import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { startGalleryCheckout } from '@/lib/gallery/checkout';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/gallery/[lotId]/checkout — Buy Now. Reserves the piece for the
 * signed-in buyer and answers with the Stripe Checkout URL to send them to.
 * Price, shipping and tax all come from the server (see lib/gallery).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ lotId: string }> }) {
  // Starting checkout reserves a piece for the caller's account, so a page on
  // another site must not be able to do it on their behalf.
  const crossSite = rejectCrossSiteAuthRequest(req, { json: false });
  if (crossSite) return crossSite;

  try {
    const { lotId } = await params;
    if (!UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'This piece could not be found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to buy this piece.', code: 'SIGN_IN' }, { status: 401 });
    }

    const [perUser, perIp] = await Promise.all([
      rateLimit(`gallery:checkout:${user.id}`, { maxRequests: 12, windowSeconds: 600 }),
      rateLimit(`gallery:checkout:ip:${getClientIp(req)}`, { maxRequests: 30, windowSeconds: 600 }),
    ]);
    if (!perUser.success || !perIp.success) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 });
    }

    const [buyer] = await db
      .select({
        id: users.id,
        email: users.email,
        stripeCustomerId: users.stripeCustomerId,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!buyer) {
      // The profile row is made when the email is confirmed; without it the
      // account isn't finished.
      return NextResponse.json(
        { error: 'Please confirm your email address before buying. Check your inbox for the link.', code: 'SIGN_IN' },
        { status: 403 },
      );
    }
    if (buyer.accountStatus !== 'active') {
      return NextResponse.json(
        { error: 'Your account can’t make purchases right now. Please contact us.', code: 'ACCOUNT_RESTRICTED' },
        { status: 403 },
      );
    }

    const result = await startGalleryCheckout(lotId, buyer);
    if (!result.ok) {
      const { ok: _ok, status, ...body } = result;
      void _ok;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ url: result.url });
  } catch (error) {
    logger.error('Buy Now checkout error', error);
    return NextResponse.json({ error: 'Unable to start checkout. Please try again.' }, { status: 500 });
  }
}
