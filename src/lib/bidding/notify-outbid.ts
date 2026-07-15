import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendOutbidNotification } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export interface OutbidRecipient {
  bidderId: string;
  yourBid: number;
}

/**
 * Decide who to notify after a bid resolves. Pure so it can be unit-tested.
 *
 * Notifies exactly the people who lost the top spot, each at most once:
 *  - the bidder who was leading BEFORE this request, if they're no longer the
 *    final high bidder (someone bid over their max); and
 *  - the requester, if a rival's proxy instantly bid over them on submit.
 *
 * Intermediate proxy ping-pong is ignored — only the final state matters — so a
 * long max-bid war produces at most these two notifications, never a flood.
 */
export function computeOutbidRecipients(params: {
  priorHighBidderId: string | null;
  priorAmount: number;
  requesterId: string;
  requesterAmount: number;
  finalHighBidderId: string | null;
}): OutbidRecipient[] {
  const map = new Map<string, number>();
  if (params.priorHighBidderId && params.priorHighBidderId !== params.finalHighBidderId) {
    map.set(params.priorHighBidderId, params.priorAmount);
  }
  if (params.requesterId !== params.finalHighBidderId) {
    map.set(params.requesterId, params.requesterAmount);
  }
  return [...map].map(([bidderId, yourBid]) => ({ bidderId, yourBid }));
}

/**
 * Email a bidder that they've been outbid — respecting their notification
 * preferences. Best-effort and self-contained (never throws) so it can be run
 * fire-and-forget from a route's `after()` without affecting the bid response.
 */
export async function notifyOutbid(params: {
  bidderId: string;
  yourBid: number;
  currentBid: number;
  lotTitle: string;
  lotRef: string; // slug or id for the public lot URL
}): Promise<void> {
  try {
    const [user] = await db
      .select({
        email: users.email,
        outbidNotifications: users.outbidNotifications,
        emailNotifications: users.emailNotifications,
      })
      .from(users)
      .where(eq(users.id, params.bidderId))
      .limit(1);

    if (!user?.email) return;
    // Respect both the global email opt-out and the specific outbid toggle.
    if (user.emailNotifications === false || user.outbidNotifications === false) return;

    await sendOutbidNotification({
      email: user.email,
      lotTitle: params.lotTitle,
      lotUrl: `${APP_URL}/lots/${params.lotRef}`,
      currentBid: params.currentBid,
      yourBid: params.yourBid,
    });
  } catch (err) {
    logger.error('Failed to send outbid notification', err, { bidderId: params.bidderId });
  }
}
