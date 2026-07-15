import { db } from '@/db';
import { watchlist, lots, auctionLots, users } from '@/db/schema';
import { and, eq, gt, lte, isNull, inArray } from 'drizzle-orm';
import { sendEndingSoonNotification } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// Don't blast an unbounded number of emails in a single cron tick.
const MAX_PER_RUN = 300;

export interface EndingSoonResult {
  sent: number;
  skipped: number;
  capped: boolean;
}

/**
 * Email watchers whose watched lots are closing within `windowMinutes`, once
 * each. Called from the auction-lifecycle cron (which holds a distributed lock,
 * so runs never overlap). Each processed watch is stamped `endingSoonNotifiedAt`
 * so it is never re-sent — including for users who have emails switched off, so
 * they aren't re-scanned every tick.
 */
export async function notifyWatchersOfEndingLots(
  now: Date,
  windowMinutes = 60,
): Promise<EndingSoonResult> {
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const candidates = await db
    .select({
      watchId: watchlist.id,
      userId: watchlist.userId,
      lotId: lots.id,
      title: lots.title,
      slug: lots.slug,
      currentBidAmount: lots.currentBidAmount,
      bidCount: lots.bidCount,
      closingAt: auctionLots.closingAt,
    })
    .from(watchlist)
    .innerJoin(lots, eq(lots.id, watchlist.lotId))
    .innerJoin(auctionLots, eq(auctionLots.lotId, lots.id))
    .where(
      and(
        isNull(watchlist.endingSoonNotifiedAt),
        eq(lots.status, 'in_auction'),
        gt(auctionLots.closingAt, now),
        lte(auctionLots.closingAt, windowEnd),
      ),
    )
    .limit(MAX_PER_RUN + 1);

  const capped = candidates.length > MAX_PER_RUN;
  const batch = capped ? candidates.slice(0, MAX_PER_RUN) : candidates;
  if (batch.length === 0) return { sent: 0, skipped: 0, capped: false };

  // A lot in more than one auction row could yield duplicate watch rows — keep
  // the earliest closing time per watch entry.
  const byWatch = new Map<string, (typeof batch)[number]>();
  for (const row of batch) {
    const existing = byWatch.get(row.watchId);
    if (!existing || (row.closingAt && existing.closingAt && row.closingAt < existing.closingAt)) {
      byWatch.set(row.watchId, row);
    }
  }
  const entries = [...byWatch.values()];

  // Batch-load recipient emails + global email preference.
  const userIds = [...new Set(entries.map((e) => e.userId))];
  const recipients = await db
    .select({ id: users.id, email: users.email, emailNotifications: users.emailNotifications })
    .from(users)
    .where(inArray(users.id, userIds));
  const userMap = new Map(recipients.map((u) => [u.id, u]));

  let sent = 0;
  let skipped = 0;
  // Only watches we successfully emailed OR deliberately skipped (opt-out / no
  // email) get stamped. A watch whose send THREW is left unstamped so the next
  // cron tick retries it — a transient Resend outage must not permanently
  // suppress the alert. (The lot leaving 'in_auction' at close naturally stops
  // any retry for a persistently-bad address.)
  const toStamp: string[] = [];

  for (const entry of entries) {
    const user = userMap.get(entry.userId);
    if (!user?.email || user.emailNotifications === false || !entry.closingAt) {
      skipped++;
      toStamp.push(entry.watchId); // deliberate skip — don't rescan every tick
      continue;
    }
    try {
      await sendEndingSoonNotification({
        email: user.email,
        lotTitle: entry.title,
        lotUrl: `${APP_URL}/lots/${entry.slug || entry.lotId}`,
        currentBid: entry.currentBidAmount,
        hasBids: entry.bidCount > 0,
        closingAt: entry.closingAt,
      });
      sent++;
      toStamp.push(entry.watchId);
    } catch (err) {
      // Leave unstamped → retried next tick.
      logger.error('Failed to send ending-soon email', err, { watchId: entry.watchId });
      skipped++;
    }
  }

  if (toStamp.length > 0) {
    await db
      .update(watchlist)
      .set({ endingSoonNotifiedAt: now })
      .where(inArray(watchlist.id, toStamp));
  }

  return { sent, skipped, capped };
}
