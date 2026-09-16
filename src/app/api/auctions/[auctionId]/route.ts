import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctions, users, bids } from '@/db/schema';
import { eq, sql, or } from 'drizzle-orm';
import { auctionUpdateSchema } from '@/lib/validation/schemas';
import {
  openAuctionLots,
  forceCloseAuctionLots,
  cancelAuction,
  rescheduleAuctionClose,
} from '@/lib/bidding/lifecycle';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isPubliclyVisibleAuction, toPublicAuction } from '@/lib/auctions/visibility';
import { logger } from '@/lib/logger';

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
      if (user) {
        const [profile] = await db
          .select({ role: users.role, isAdmin: users.isAdmin })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        isAdmin = isAdminProfile(profile);
      }
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

    // Convert datetime strings to Date objects for timestamp columns
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: sql`now()` };
    if (typeof updateData.previewStartsAt === 'string') {
      updateData.previewStartsAt = new Date(updateData.previewStartsAt as string);
    }
    if (typeof updateData.biddingStartsAt === 'string') {
      updateData.biddingStartsAt = new Date(updateData.biddingStartsAt as string);
    }
    if (typeof updateData.biddingEndsAt === 'string') {
      updateData.biddingEndsAt = new Date(updateData.biddingEndsAt as string);
    }

    // A manual transition to 'open' must run the same lot-opening step the
    // lifecycle cron performs (lot status, per-lot closingAt, Redis bid state);
    // a bare status flip would leave every lot unbiddable. openAuctionLots is
    // idempotent, and runs BEFORE the status flip (mirroring the cron and the
    // live-start route) so a failure leaves the auction re-openable.
    const [existing] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Status is a state machine shared with the lifecycle cron and the live
    // console. Only transitions an operator legitimately makes by hand are
    // accepted here; the rest are either automatic (completed) or owned by a
    // dedicated route (live start/end).
    const nextStatus = parsed.data.status;
    const changesStatus = nextStatus !== undefined && nextStatus !== existing.status;
    const PRE_OPEN = ['draft', 'scheduled', 'preview'];
    const BIDDING = ['open', 'live'];
    const now = new Date();

    if (changesStatus) {
      if (nextStatus === 'live') {
        return NextResponse.json(
          { error: 'Start a live session from the Live Auctions console.' },
          { status: 409 },
        );
      }
      if (nextStatus === 'completed') {
        return NextResponse.json(
          { error: 'An auction completes automatically once every lot has settled.' },
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
    // original staggered close times.
    if (changesStatus && (nextStatus === 'closing' || nextStatus === 'closed')) {
      await forceCloseAuctionLots(auctionId, now);
      updateData.status = 'closing';
      updateData.actualEndedAt = existing.actualEndedAt ?? now;
    }

    // Moving the close time of a sale that is already open must also move the
    // per-lot close times and the Redis close gate, or the site would show a
    // new countdown while bidding still stops at the old time.
    const newEnd = updateData.biddingEndsAt as Date | undefined;
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

    const opensBidding =
      parsed.data.status === 'open' &&
      ['draft', 'scheduled', 'preview'].includes(existing.status);

    if (opensBidding) {
      const effective = {
        ...existing,
        biddingEndsAt: (updateData.biddingEndsAt as Date | undefined) ?? existing.biddingEndsAt,
      };
      // A timed auction with no end time can't be opened correctly
      // (openAuctionLots refuses it) — don't flip it to 'open' with
      // unbiddable lots.
      if (effective.type !== 'live' && !effective.biddingEndsAt) {
        return NextResponse.json(
          { error: 'Set a bidding end date before opening this auction.' },
          { status: 400 },
        );
      }
      await openAuctionLots(effective);
    }

    const [updated] = await db
      .update(auctions)
      .set(updateData as typeof auctions.$inferInsert)
      .where(eq(auctions.id, auctionId))
      .returning();

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

    if (['open', 'live', 'closing'].includes(auction.status)) {
      return NextResponse.json(
        { error: `Cannot delete an auction that is ${auction.status}` },
        { status: 400 },
      );
    }

    await db.delete(auctions).where(eq(auctions.id, auctionId));
    revalidatePublicCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
