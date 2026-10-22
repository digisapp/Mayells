import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi, isAdminUser } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, lotImages, bids, users, invoices, auctionLots, auctions, uploadItems } from '@/db/schema';
import { eq, desc, sql, or, and, inArray, ne } from 'drizzle-orm';
import { lotUpdateSchema } from '@/lib/validation/schemas';
import { toPublicLot, isPubliclyVisibleLot } from '@/lib/lots/visibility';
import { getLotPlacements, isLotInPublicAuction, findActivePlacement } from '@/lib/lots/placement';
import { PUBLIC_AUCTION_STATUSES } from '@/lib/auctions/visibility';
import { publicLotPath } from '@/lib/lots/urls';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { withdrawLot, LotWithdrawBlockedError } from '@/lib/bidding/lifecycle';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { findLiveInvoiceForLot } from '@/lib/invoicing/generate-invoice';
import { onlineCheckoutBlockers } from '@/lib/gallery/purchase-state';
import { getCheckoutReadiness } from '@/lib/gallery/readiness';
import { formatClockTime } from '@/lib/format/dates';
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

class ReservationRefusal extends Error {}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Why the lot's price, shipping, sale type or status can't change right now:
 * a live invoice (a Buy Now checkout hold, or a client's invoice) has it
 * reserved on those terms. Null when nothing reserves it.
 */
async function reservationRefusal(executor: DbOrTx, lotId: string): Promise<string | null> {
  const live = await findLiveInvoiceForLot(executor, lotId);
  if (!live) return null;
  const what = live.holdExpiresAt
    ? `a buyer's online checkout (held until ${formatClockTime(live.holdExpiresAt)})`
    : `invoice ${live.invoiceNumber}, awaiting payment`;
  return `This piece is reserved by ${what}. Cancel invoice ${live.invoiceNumber} in Invoices first${live.holdExpiresAt ? ', or wait for the hold to lapse' : ''}.`;
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
    const isAdmin = await isAdminUser(user?.id);

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
      const directSale = lot.saleType === 'gallery' || lot.saleType === 'private';
      const [placements, seller, highBidder, winner, invoiceRows, bidders, reservationRows, checkout] = await Promise.all([
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
        // A gallery piece's live invoice: a Buy Now hold or a client's invoice.
        directSale && lot.status !== 'sold'
          ? db
              .select({
                id: invoices.id,
                invoiceNumber: invoices.invoiceNumber,
                status: invoices.status,
                totalAmount: invoices.totalAmount,
                holdExpiresAt: invoices.holdExpiresAt,
                dueDate: invoices.dueDate,
                buyerName: users.fullName,
                buyerEmail: users.email,
              })
              .from(invoices)
              .innerJoin(users, eq(users.id, invoices.buyerId))
              .where(and(eq(invoices.lotId, lot.id), inArray(invoices.status, ['pending', 'overdue'])))
              .limit(1)
          : Promise.resolve([]),
        directSale ? getCheckoutReadiness() : Promise.resolve(null),
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
          reservation: reservationRows[0] ?? null,
          checkout,
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
      // An explicit null clears the price in this same request (so `??` would
      // wrongly fall back to the saved one); only an absent field keeps it.
      const effectiveBuyNow = fieldUpdates.buyNowPrice !== undefined ? fieldUpdates.buyNowPrice : existing.buyNowPrice;
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

    // Buy Now can only be switched on (or stay on) for a gallery piece with a
    // price and a shipping charge; the public page and checkout rely on it.
    const effectiveOnline = fieldUpdates.onlineCheckout ?? existing.onlineCheckout;
    if (effectiveOnline) {
      const blockers = onlineCheckoutBlockers({
        saleType: fieldUpdates.saleType ?? existing.saleType,
        status: nextStatus ?? existing.status,
        buyNowPrice: fieldUpdates.buyNowPrice !== undefined ? fieldUpdates.buyNowPrice : existing.buyNowPrice,
        shippingPrice: fieldUpdates.shippingPrice !== undefined ? fieldUpdates.shippingPrice : existing.shippingPrice,
      });
      if (blockers.length > 0) {
        return NextResponse.json(
          { error: `Online checkout needs this first: ${blockers.join(' ')} Or switch online checkout off.` },
          { status: 409 },
        );
      }
    }

    // A live invoice (a Buy Now checkout hold, or a client's invoice) has the
    // piece reserved at its current price and shipping. Changing those, its
    // sale type or its status would leave that invoice selling something
    // else — or something no longer on sale.
    // Checked here for a quick answer, and again under the lot's row lock in
    // the update below: a checkout can start in between (it takes the same lock).
    const changes = <K extends keyof typeof fieldUpdates>(key: K) =>
      fieldUpdates[key] !== undefined && fieldUpdates[key] !== existing[key as keyof typeof existing];
    const touchesReservation =
      existing.status !== 'sold' && (changesStatus || changes('saleType') || changes('buyNowPrice') || changes('shippingPrice'));
    if (touchesReservation) {
      const refusal = await reservationRefusal(db, lotId);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
    }

    // A lot placed in an unfinished sale takes its status and sale type from
    // that sale (catalogued → in_auction → sold/unsold). Changing either by
    // hand would desync the catalogue, so take it out of the sale first.
    // Withdrawal is the exception: it detaches the lot itself (below).
    const withdrawing = changesStatus && nextStatus === 'withdrawn';
    const changesSaleType = fieldUpdates.saleType !== undefined && fieldUpdates.saleType !== existing.saleType;
    if ((changesStatus || changesSaleType) && !withdrawing) {
      const placement = await findActivePlacement(lotId);
      if (placement) {
        const settling = placement.auctionStatus === 'closing' || placement.auctionStatus === 'closed';
        return NextResponse.json(
          {
            error: settling
              ? `This lot is in ${placement.auctionTitle}, which is being settled. Wait for settlement to finish, then try again.`
              : `This lot is in ${placement.auctionTitle}. Remove it from the sale first.`,
          },
          { status: 409 },
        );
      }
    }

    // Withdrawal has engine side effects (detach from sale, retract bids,
    // clear Redis). Run it first, then apply any remaining field edits below.
    if (withdrawing) {
      try {
        await withdrawLot(lotId);
      } catch (err) {
        if (err instanceof LotWithdrawBlockedError) {
          return NextResponse.json({ error: err.message }, { status: 409 });
        }
        throw err;
      }
    }

    const setValues = changesStatus && !withdrawing
      ? { ...fieldUpdates, status: nextStatus }
      : fieldUpdates;

    let updated: typeof existing | undefined;
    try {
      updated = await db.transaction(async (tx) => {
      if (touchesReservation && !withdrawing) {
        await tx.select({ id: lots.id }).from(lots).where(eq(lots.id, lotId)).for('update');
        const refusal = await reservationRefusal(tx, lotId);
        if (refusal) throw new ReservationRefusal(refusal);
      }

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
    } catch (err) {
      if (err instanceof ReservationRefusal) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }

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

    // Invoices are financial records too (invoices → lots has no cascade):
    // even an abandoned Buy Now checkout leaves one.
    const [invoiceRef] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.lotId, lotId)).limit(1);
    if (invoiceRef) {
      return NextResponse.json(
        { error: 'This lot has invoice history (a sale or a checkout) and cannot be deleted. Withdraw it instead.' },
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

      // upload_items.lot_id has no foreign key, so a deleted lot would leave
      // its intake item pointing at nothing: never offered for lot creation
      // again, and blocking the prospect's deletion. Hand it back as accepted.
      await tx
        .update(uploadItems)
        .set({ lotId: null, auctionId: null, status: 'accepted', updatedAt: new Date() })
        .where(eq(uploadItems.lotId, lotId));

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
