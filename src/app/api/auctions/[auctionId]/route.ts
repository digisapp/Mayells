import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctions, auctionLots, lots, users, bids } from '@/db/schema';
import { and, eq, ne, sql, or } from 'drizzle-orm';
import { auctionUpdateSchema } from '@/lib/validation/schemas';
import {
  openAuctionLots,
  markLiveAuctioneersLotsListed,
  forceCloseAuctionLots,
  cancelAuction,
  rescheduleAuctionClose,
} from '@/lib/bidding/lifecycle';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { biddingVenue } from '@/lib/bidding/venue';
import { isPubliclyVisibleAuction, toPublicAuction } from '@/lib/auctions/visibility';
import { isAdminUser } from '@/lib/auth/require-admin';
import { isUniqueViolation, SLUG_IN_USE_ERROR } from '@/lib/auctions/db-errors';
import { clearedDateRefusal, type ClearableDate } from '@/lib/auctions/schedule-rules';
import { logger } from '@/lib/logger';

const DATE_FIELDS: ClearableDate[] = ['previewStartsAt', 'biddingStartsAt', 'biddingEndsAt'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Accept a UUID or a slug (a non-UUID string compared against the uuid
    // column throws 22P02 in Postgres, so only match on id when it looks like one).
    const [auction] = await db
      .select()
      .from(auctions)
      .where(
        UUID_RE.test(auctionId)
          ? or(eq(auctions.id, auctionId), eq(auctions.slug, auctionId))
          : eq(auctions.slug, auctionId),
      )
      .limit(1);

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Only admins may see draft/cancelled auctions or internal fields
    // (livekitRoomName, createdById, auctioneerId). Everyone else gets the
    // same public projection as the list endpoint.
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      isAdmin = await isAdminUser(user?.id);
    } catch {
      isAdmin = false;
    }

    const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
    if (isAdmin) {
      return NextResponse.json({ data: auction }, { headers: noStore });
    }
    if (!isPubliclyVisibleAuction(auction.status)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    return NextResponse.json({ data: toPublicAuction(auction) }, { headers: noStore });
  } catch (error) {
    logger.error('Get auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = auctionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Timestamp columns: an ISO string sets the date, null clears it (the
    // editor emptied the field), undefined leaves it as it is.
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: sql`now()` };
    for (const field of DATE_FIELDS) {
      const value = parsed.data[field];
      if (value !== undefined) updateData[field] = value === null ? null : new Date(value);
    }

    const [existing] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const PRE_OPEN = ['draft', 'scheduled', 'preview'];
    const BIDDING = ['open', 'live'];
    const now = new Date();

    // The LiveAuctioneers link decides where the sale is bid (lib/bidding/
    // venue.ts). It is fixed once bidding opens — an open mayells.com sale
    // has biddable lots that a LiveAuctioneers sale must never have, and an
    // open LiveAuctioneers sale has none to bid on here — and from the first
    // bid on mayells.com, which moving the sale would strand.
    if (parsed.data.liveauctioneersUrl !== undefined) {
      const nextVenue = biddingVenue({ liveauctioneersUrl: parsed.data.liveauctioneersUrl });
      if (nextVenue !== biddingVenue(existing)) {
        if (!PRE_OPEN.includes(existing.status)) {
          return NextResponse.json(
            { error: `This sale is ${existing.status}, so where it is bid can no longer change.` },
            { status: 409 },
          );
        }
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(bids)
          .where(eq(bids.auctionId, auctionId));
        if (n > 0) {
          return NextResponse.json(
            { error: 'This sale already has bids on mayells.com, so where it is bid can no longer change.' },
            { status: 409 },
          );
        }
      }
      // Store "no link" as null rather than an empty string.
      if (!parsed.data.liveauctioneersUrl.trim()) updateData.liveauctioneersUrl = null;
    }
    const effectiveLaUrl = parsed.data.liveauctioneersUrl !== undefined
      ? (updateData.liveauctioneersUrl as string | null)
      : existing.liveauctioneersUrl;
    const venue = biddingVenue({ liveauctioneersUrl: effectiveLaUrl });
    const effectiveType = parsed.data.type ?? existing.type;

    // Status is a state machine shared with the lifecycle cron and the live
    // console. Only transitions an operator legitimately makes by hand are
    // accepted here; the rest are either automatic (completed) or owned by a
    // dedicated route (live start/end).
    const nextStatus = parsed.data.status;
    const changesStatus = nextStatus !== undefined && nextStatus !== existing.status;

    if (changesStatus) {
      if (nextStatus === 'live') {
        return NextResponse.json(
          { error: 'Start a live session from the Live Auctions console.' },
          { status: 409 },
        );
      }
      if (nextStatus === 'completed') {
        return NextResponse.json(
          {
            error: venue === 'liveauctioneers'
              ? 'A LiveAuctioneers sale completes once every lot has a recorded result.'
              : 'An auction completes automatically once every lot has settled.',
          },
          { status: 409 },
        );
      }
      if (nextStatus === 'open' && !PRE_OPEN.includes(existing.status)) {
        return NextResponse.json(
          { error: `Only a draft, scheduled or preview auction can be opened (this one is ${existing.status}).` },
          { status: 409 },
        );
      }
      if (PRE_OPEN.includes(nextStatus!) && !PRE_OPEN.includes(existing.status)) {
        return NextResponse.json(
          { error: `An auction that is ${existing.status} cannot go back to ${nextStatus}.` },
          { status: 409 },
        );
      }
      if ((nextStatus === 'closing' || nextStatus === 'closed') && !BIDDING.includes(existing.status)) {
        return NextResponse.json(
          { error: `Only an open or live auction can be closed (this one is ${existing.status}).` },
          { status: 409 },
        );
      }
    }

    // A date the sale still runs on can't be emptied (schedule-rules.ts).
    // Only a real clear is checked: a date that was never set stays allowed.
    const after = { status: changesStatus ? nextStatus! : existing.status, type: effectiveType };
    for (const field of DATE_FIELDS) {
      if (parsed.data[field] !== null || existing[field] === null) continue;
      const refusal = clearedDateRefusal(after, field);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
    }

    const effectiveEnd = parsed.data.biddingEndsAt !== undefined
      ? (updateData.biddingEndsAt as Date | null)
      : existing.biddingEndsAt;
    const opensBidding = changesStatus && nextStatus === 'open';

    if (opensBidding) {
      // Opening with a close time already behind us would have the cron end
      // the sale on its next tick. A live sale with no close time is fine.
      if (effectiveEnd && effectiveEnd.getTime() <= now.getTime()) {
        return NextResponse.json(
          { error: 'This sale\'s bidding close time has already passed. Set a new close time first, then open bidding.' },
          { status: 400 },
        );
      }
      // A timed auction with no end time can't be opened correctly
      // (openAuctionLots refuses it) — don't flip it to 'open' with
      // unbiddable lots. A LiveAuctioneers sale opens no lots here.
      if (venue === 'mayells' && effectiveType !== 'live' && !effectiveEnd) {
        return NextResponse.json(
          { error: 'Set a bidding end date before opening this auction.' },
          { status: 400 },
        );
      }
    }

    // auctions.slug is unique. Checked before any side effect below so a
    // taken slug can't leave lots opened under a sale that never flipped.
    if (parsed.data.slug !== undefined && parsed.data.slug !== existing.slug) {
      const [taken] = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(and(eq(auctions.slug, parsed.data.slug), ne(auctions.id, auctionId)))
        .limit(1);
      if (taken) return NextResponse.json({ error: SLUG_IN_USE_ERROR }, { status: 409 });
    }

    // Cancelling has its own side effects (release lots, drop Redis state) and
    // refuses once bids exist — handled entirely by the lifecycle helper.
    if (changesStatus && nextStatus === 'cancelled') {
      const result = await cancelAuction(existing, now);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 409 });
      }
      delete updateData.status;
    }

    // Ending bidding early: collapse every lot's close time (Postgres + Redis)
    // so no further bid can land, then park the sale in 'closing' — the
    // settlement cron picks it up on its next tick exactly like the live-end
    // route. A bare flip to 'closed' would leave lots biddable until their
    // original staggered close times. A LiveAuctioneers sale has nothing to
    // settle here, so it goes straight to 'closed' and waits for its results.
    if (changesStatus && (nextStatus === 'closing' || nextStatus === 'closed')) {
      await forceCloseAuctionLots(auctionId, now);
      updateData.status = venue === 'liveauctioneers' ? 'closed' : 'closing';
      updateData.actualEndedAt = existing.actualEndedAt ?? now;
    }

    // Moving the close time of a sale that is already open must also move the
    // per-lot close times and the Redis close gate, or the site would show a
    // new countdown while bidding still stops at the old time.
    const newEnd = updateData.biddingEndsAt as Date | null | undefined;
    if (
      newEnd &&
      BIDDING.includes(existing.status) &&
      !changesStatus &&
      newEnd.getTime() !== (existing.biddingEndsAt?.getTime() ?? NaN)
    ) {
      if (newEnd.getTime() <= now.getTime()) {
        return NextResponse.json(
          { error: 'The new close time must be in the future. Use "End bidding now" to close the sale immediately.' },
          { status: 400 },
        );
      }
      await rescheduleAuctionClose({ ...existing, ...updateData, biddingEndsAt: newEnd } as typeof existing, newEnd);
    }

    // A manual transition to 'open' must run the same lot-opening step the
    // lifecycle cron performs (lot status, per-lot closingAt, Redis bid state);
    // a bare status flip would leave every lot unbiddable. openAuctionLots is
    // idempotent, and runs BEFORE the status flip (mirroring the cron and the
    // live-start route) so a failure leaves the auction re-openable. A
    // LiveAuctioneers sale only changes status: its lots stay approved
    // (public in an open sale) and take no bids here.
    if (opensBidding && venue === 'mayells') {
      await openAuctionLots({ ...existing, type: effectiveType, biddingEndsAt: effectiveEnd, liveauctioneersUrl: effectiveLaUrl });
    } else if (opensBidding) {
      await markLiveAuctioneersLotsListed(auctionId, now);
    }

    let updated: typeof auctions.$inferSelect | undefined;
    try {
      [updated] = await db
        .update(auctions)
        .set(updateData as typeof auctions.$inferInsert)
        .where(eq(auctions.id, auctionId))
        .returning();
    } catch (err) {
      // Lost a race for the slug since the check above.
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: SLUG_IN_USE_ERROR }, { status: 409 });
      }
      throw err;
    }

    if (!updated) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    revalidatePublicCatalog(updated.slug);
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // bids → auctions is ON DELETE RESTRICT: a sale that took bids is a
    // financial record and cannot be hard-deleted. Cancelling (pre-bid) or
    // letting it settle are the supported paths.
    const [{ bidCount }] = await db
      .select({ bidCount: sql<number>`count(*)` })
      .from(bids)
      .where(eq(bids.auctionId, auctionId));
    if (Number(bidCount) > 0) {
      return NextResponse.json(
        { error: 'This auction has bid history and cannot be deleted.' },
        { status: 409 },
      );
    }

    if (['open', 'live', 'closing', 'closed'].includes(auction.status)) {
      return NextResponse.json(
        {
          error: auction.status === 'closed'
            ? 'This auction is being settled and cannot be deleted.'
            : `Cannot delete an auction that is ${auction.status}`,
        },
        { status: 400 },
      );
    }

    // A LiveAuctioneers sale takes no bids here, so the check above can't
    // see its sales; a recorded result makes it a sales record too.
    if (biddingVenue(auction) === 'liveauctioneers') {
      const [soldLot] = await db
        .select({ id: lots.id })
        .from(auctionLots)
        .innerJoin(lots, eq(lots.id, auctionLots.lotId))
        .where(and(eq(auctionLots.auctionId, auctionId), eq(lots.status, 'sold')))
        .limit(1);
      if (soldLot) {
        return NextResponse.json(
          { error: 'This sale has recorded LiveAuctioneers results and cannot be deleted.' },
          { status: 409 },
        );
      }
    }

    await db.delete(auctions).where(eq(auctions.id, auctionId));
    revalidatePublicCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
