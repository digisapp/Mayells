import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, lotImages, bids, users, invoices, auctionLots, auctions } from '@/db/schema';
import { eq, desc, sql, or, and, inArray, ne } from 'drizzle-orm';
import { lotUpdateSchema } from '@/lib/validation/schemas';
import { toPublicLot, isPubliclyVisibleLot } from '@/lib/lots/visibility';
import { getLotPlacements, isLotInPublicAuction } from '@/lib/lots/placement';
import { PUBLIC_AUCTION_STATUSES } from '@/lib/auctions/visibility';
import { publicLotPath } from '@/lib/lots/urls';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { withdrawLot, LotWithdrawBlockedError } from '@/lib/bidding/lifecycle';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';
import type { Bid } from '@/db/schema';

/**
 * Public-safe bid history: amount, time, and a stable anonymized bidder
 * label only (no bidderId, maxBidAmount, ipAddress, or userAgent).
 */
function toPublicBidHistory(bidRows: Bid[]) {
  const labels = new Map<string, string>();
  // Assign labels in chronological order so "Bidder 1" is the first bidder
  for (const bid of [...bidRows].reverse()) {
    if (!labels.has(bid.bidderId)) {
      labels.set(bid.bidderId, `Bidder ${labels.size + 1}`);
    }
  }
  return bidRows.map((bid) => ({
    amount: bid.amount,
    createdAt: bid.createdAt,
    bidder: labels.get(bid.bidderId) ?? 'Bidder',
  }));
}

const userSummaryColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  paddleNumber: users.paddleNumber,
};

async function loadUserSummary(userId: string | null) {
  if (!userId) return null;
  const [row] = await db.select(userSummaryColumns).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;

    // Accept a UUID or a slug. Comparing a non-UUID string against the uuid
    // column throws in Postgres (22P02), so only include the id match when
    // the param actually looks like one.
    const [lot] = await db
      .select()
      .from(lots)
      .where(UUID_RE.test(lotId) ? or(eq(lots.id, lotId), eq(lots.slug, lotId)) : eq(lots.slug, lotId))
      .limit(1);

    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    // Admins (e.g. the admin lot editor) get the full row including
    // reservePrice and raw bid data; everyone else gets a public-safe shape,
    // and can't see unpublished lots (draft / pending_review / withdrawn) at all.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let isAdmin = false;
    if (user) {
      const [profile] = await db
        .select({ role: users.role, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      isAdmin = isAdminProfile(profile);
    }

    if (!isAdmin) {
      // A lot catalogued in a scheduled/preview sale stays `approved` until
      // bidding opens; it is still public because its sale is.
      const inPublicAuction = lot.status === 'approved' ? await isLotInPublicAuction(lot.id) : false;
      if (!isPubliclyVisibleLot(lot.status, inPublicAuction)) {
        return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
      }
    }

    const [images, bidRows] = await Promise.all([
      db.select().from(lotImages).where(eq(lotImages.lotId, lot.id)).orderBy(lotImages.sortOrder),
      db.select().from(bids).where(eq(bids.lotId, lot.id)).orderBy(desc(bids.createdAt)).limit(20),
    ]);

    // This response varies by auth (admins get reservePrice + raw bids), so it
    // must never be stored in a shared/CDN cache keyed only by URL — otherwise
    // an admin-cached full-detail payload could be served to anonymous users.
    const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

    if (isAdmin) {
      const bidderIds = [...new Set(bidRows.map((b) => b.bidderId))];
      const [placements, seller, highBidder, winner, invoiceRows, bidders] = await Promise.all([
        getLotPlacements(lot.id),
        loadUserSummary(lot.sellerId),
        loadUserSummary(lot.currentBidderId),
        loadUserSummary(lot.winnerId),
        lot.status === 'sold'
          ? db
              .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status })
              .from(invoices)
              .where(and(eq(invoices.lotId, lot.id), ne(invoices.status, 'cancelled')))
              .limit(1)
          : Promise.resolve([]),
        bidderIds.length > 0
          ? db.select(userSummaryColumns).from(users).where(inArray(users.id, bidderIds))
          : Promise.resolve([]),
      ]);

      const bidderById = new Map(bidders.map((b) => [b.id, b]));
      const bidHistory = bidRows.map((bid) => ({
        ...bid,
        bidderName: bidderById.get(bid.bidderId)?.fullName ?? null,
        bidderPaddle: bidderById.get(bid.bidderId)?.paddleNumber ?? null,
      }));

      const inPublicAuction = placements.some((p) =>
        (PUBLIC_AUCTION_STATUSES as readonly string[]).includes(p.auctionStatus),
      );
      const publicPath = isPubliclyVisibleLot(lot.status, inPublicAuction) ? publicLotPath(lot) : null;

      return NextResponse.json({
        data: {
          ...lot,
          images,
          bidHistory,
          placements,
          seller: seller ? { id: seller.id, fullName: seller.fullName, email: seller.email } : null,
          highBidder: highBidder
            ? { id: highBidder.id, fullName: highBidder.fullName, paddleNumber: highBidder.paddleNumber }
            : null,
          winner: winner ? { id: winner.id, fullName: winner.fullName, paddleNumber: winner.paddleNumber } : null,
          invoice: invoiceRows[0] ?? null,
          publicPath,
        },
      }, { headers: noStore });
    }

    return NextResponse.json({
      data: { ...toPublicLot(lot), images, bidHistory: toPublicBidHistory(bidRows) },
    }, { headers: noStore });
  } catch (error) {
    logger.error('Get lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    if (!UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = lotUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Resolve the sale slug up front: a withdrawal detaches the lot from its
    // sale, and we still want to revalidate that sale's catalogue afterwards.
    const [existingRow] = await db
      .select({ lot: lots, auctionSlug: bestAuctionSlugSql })
      .from(lots)
      .where(eq(lots.id, lotId))
      .limit(1);
    if (!existingRow) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }
    const existing = existingRow.lot;
    const auctionSlug = existingRow.auctionSlug;

    // Status is a state machine shared with the bid engine and the settlement
    // cron. A bare column write can strand a lot (e.g. "in_auction" with no
    // Redis bid state, or "sold" with no invoice), so hand-edits are limited to
    // the transitions an operator legitimately makes; everything else flows
    // through assigning the lot to a sale, opening it, and letting it settle.
    const { status: nextStatus, ...fieldUpdates } = parsed.data;
    const changesStatus = nextStatus !== undefined && nextStatus !== existing.status;
    if (changesStatus) {
      const from = existing.status;
      const to = nextStatus;
      if (to === 'in_auction' || to === 'sold') {
        return NextResponse.json(
          { error: `A lot becomes "${to.replace('_', ' ')}" through its auction — assign it to a sale and open the sale, or let the sale settle.` },
          { status: 409 },
        );
      }
      if (from === 'sold') {
        return NextResponse.json(
          { error: 'A sold lot is a settled record. Refund the invoice to return it to inventory.' },
          { status: 409 },
        );
      }
      if (from === 'in_auction' && to !== 'withdrawn') {
        return NextResponse.json(
          { error: 'This lot is in an active sale. Withdraw it, or wait for the sale to settle.' },
          { status: 409 },
        );
      }
      const effectiveSaleType = fieldUpdates.saleType ?? existing.saleType;
      const effectiveBuyNow = fieldUpdates.buyNowPrice ?? existing.buyNowPrice;
      if (to === 'for_sale') {
        if (effectiveSaleType === 'auction') {
          return NextResponse.json(
            { error: 'Auction lots are listed by opening their sale. Switch the sale type to Gallery or Private to list it directly.' },
            { status: 409 },
          );
        }
        if (effectiveSaleType === 'gallery' && !effectiveBuyNow) {
          return NextResponse.json(
            { error: 'Set a Buy Now price before listing a gallery lot for sale.' },
            { status: 409 },
          );
        }
      }
    }

    // Withdrawal has engine side effects (detach from sale, retract bids,
    // clear Redis). Run it first, then apply any remaining field edits below.
    if (changesStatus && nextStatus === 'withdrawn') {
      try {
        await withdrawLot(lotId);
      } catch (err) {
        if (err instanceof LotWithdrawBlockedError) {
          return NextResponse.json({ error: err.message }, { status: 409 });
        }
        throw err;
      }
    }

    const setValues = changesStatus && nextStatus !== 'withdrawn'
      ? { ...fieldUpdates, status: nextStatus }
      : fieldUpdates;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(lots)
        .set({ ...setValues, updatedAt: sql`now()` })
        .where(eq(lots.id, lotId))
        .returning();

      // Keep lot_images.isPrimary in sync with the lot's primaryImageUrl so
      // the primary flag survives reload and image DELETE sees true state.
      if (row && parsed.data.primaryImageUrl) {
        await tx
          .update(lotImages)
          .set({ isPrimary: sql`(${lotImages.url} = ${parsed.data.primaryImageUrl})` })
          .where(eq(lotImages.lotId, lotId));
      }

      return row;
    });

    if (!updated) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    revalidatePublicCatalog(auctionSlug);
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    if (!UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    if (lot.status === 'in_auction' || lot.status === 'sold') {
      return NextResponse.json(
        { error: `Cannot delete a lot that is ${lot.status.replace('_', ' ')}` },
        { status: 400 },
      );
    }

    // bids → lots is ON DELETE RESTRICT (bid history is a financial record), so
    // a lot that has ever been bid on can't be hard-deleted. Say so instead of
    // surfacing a Postgres constraint error as a 500.
    const [{ bidCount }] = await db
      .select({ bidCount: sql<number>`count(*)` })
      .from(bids)
      .where(and(eq(bids.lotId, lotId), inArray(bids.status, ['active', 'outbid', 'winning', 'won', 'retracted'])));
    if (Number(bidCount) > 0) {
      return NextResponse.json(
        { error: 'This lot has bid history and cannot be deleted. Withdraw it instead.' },
        { status: 409 },
      );
    }

    // auction_lots rows cascade away with the lot, but each sale's
    // denormalized lotCount would be left one too high — decrement it in the
    // same transaction so a draft/scheduled catalogue stays consistent.
    const affectedSlugs = await db.transaction(async (tx) => {
      const placements = await tx
        .select({ auctionId: auctionLots.auctionId, auctionSlug: auctions.slug })
        .from(auctionLots)
        .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
        .where(eq(auctionLots.lotId, lotId));

      for (const placement of placements) {
        await tx
          .update(auctions)
          .set({ lotCount: sql`greatest(${auctions.lotCount} - 1, 0)`, updatedAt: sql`now()` })
          .where(eq(auctions.id, placement.auctionId));
      }

      await tx.delete(lots).where(eq(lots.id, lotId));
      return [...new Set(placements.map((p) => p.auctionSlug))];
    });

    if (affectedSlugs.length === 0) {
      revalidatePublicCatalog();
    } else {
      for (const slug of affectedSlugs) revalidatePublicCatalog(slug);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
