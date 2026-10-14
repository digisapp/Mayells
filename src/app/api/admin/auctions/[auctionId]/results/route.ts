import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { auctions, auctionLots, lots, consignments } from '@/db/schema';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { biddingVenue } from '@/lib/bidding/venue';
import { clearLotBidState } from '@/lib/bidding/lifecycle';
import { relistUnsoldLot, returnUnsoldLot } from '@/lib/lots/relist';
import {
  LA_AWAITING_RESULT_LOT_STATUSES,
  decideLaResult,
  laResultSchema,
  laSaleRefusal,
} from '@/lib/auctions/la-results';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';

type Outcome = 'sold' | 'relisted' | 'returned';

/**
 * POST /api/admin/auctions/[auctionId]/results — record one lot's result
 * from a LiveAuctioneers sale (see lib/auctions/la-results.ts):
 *   { lotId, outcome: 'sold', hammerPrice }   hammer price in cents
 *   { lotId, outcome: 'relist' }               unsold → gallery buy-now
 *   { lotId, outcome: 'return' }               unsold → back to the consignor
 * Re-sending a result already on file is a no-op success; re-sending `sold`
 * with a different hammer price corrects it (also after the sale completed).
 * When no lot is left awaiting a result the sale is completed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const parsed = laResultSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      // Lock the sale: results for one sale apply one at a time, so the
      // "nothing left awaiting a result" count below sees every other
      // admin's committed result and exactly one request completes the sale.
      const [sale] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for('update');
      if (!sale) return { status: 404 as const, error: 'Auction not found' };
      const saleRefusal = laSaleRefusal(sale);
      // A retry of the result that completed the sale still gets its success
      // (checked below); anything else on a finished sale is refused.
      if (saleRefusal && !(sale.status === 'completed' && biddingVenue(sale) === 'liveauctioneers')) {
        return { status: 409 as const, error: saleRefusal };
      }

      const [placement] = await tx
        .select({ lotNumber: auctionLots.lotNumber })
        .from(auctionLots)
        .where(and(eq(auctionLots.auctionId, auctionId), eq(auctionLots.lotId, input.lotId)))
        .limit(1);
      if (!placement) return { status: 404 as const, error: 'That lot is not in this sale.' };

      const [lot] = await tx.select().from(lots).where(eq(lots.id, input.lotId)).for('update');
      if (!lot) return { status: 404 as const, error: 'Lot not found' };

      const decision = decideLaResult(lot, input);
      if (decision.kind === 'refuse') return { status: 409 as const, error: decision.error };
      if (saleRefusal && decision.kind === 'apply') return { status: 409 as const, error: saleRefusal };

      let outcome: Outcome;
      if (decision.kind === 'already') {
        outcome = lot.status === 'sold' ? 'sold' : lot.status === 'for_sale' ? 'relisted' : 'returned';
      } else if (decision.kind === 'correct' && input.outcome === 'sold') {
        await tx
          .update(lots)
          .set({ hammerPrice: input.hammerPrice, updatedAt: now })
          .where(eq(lots.id, lot.id));
        outcome = 'sold';
      } else if (input.outcome === 'sold') {
        // Sold on LiveAuctioneers: the buyer is theirs, so there is no
        // winnerId here, and LiveAuctioneers collects payment — no invoice
        // is raised and no consignor payout is queued for this lot.
        await tx
          .update(lots)
          .set({ status: 'sold', hammerPrice: input.hammerPrice, winnerId: null, updatedAt: now })
          .where(eq(lots.id, lot.id));
        // The legacy consignment record is what the seller's account shows.
        if (lot.consignmentId) {
          await tx
            .update(consignments)
            .set({ status: 'sold', updatedAt: now })
            .where(eq(consignments.id, lot.consignmentId));
        }
        outcome = 'sold';
      } else if (input.outcome === 'relist') {
        // Falls back to a return when the lot has no reserve or low estimate.
        outcome = await relistUnsoldLot(lot, now, tx);
      } else {
        outcome = await returnUnsoldLot(lot, now, tx);
      }

      const [{ awaiting }] = await tx
        .select({ awaiting: sql<number>`count(*)::int` })
        .from(auctionLots)
        .innerJoin(lots, eq(lots.id, auctionLots.lotId))
        .where(and(
          eq(auctionLots.auctionId, auctionId),
          inArray(lots.status, [...LA_AWAITING_RESULT_LOT_STATUSES]),
        ));
      const saleCompleted = awaiting === 0;
      if (saleCompleted && sale.status !== 'completed') {
        await tx
          .update(auctions)
          .set({ status: 'completed', actualEndedAt: sale.actualEndedAt ?? now, updatedAt: now })
          .where(eq(auctions.id, auctionId));
      }

      return {
        status: 200 as const,
        slug: sale.slug,
        changed: decision.kind !== 'already',
        // Only sales opened before LiveAuctioneers sales stopped opening on
        // site have Redis bid state to drop.
        hadBidState: lot.status === 'in_auction',
        data: {
          lotId: lot.id,
          lotNumber: placement.lotNumber,
          outcome,
          alreadyRecorded: decision.kind === 'already',
          corrected: decision.kind === 'correct',
          awaiting,
          saleCompleted,
        },
      };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (result.changed) {
      if (result.hadBidState) await clearLotBidState([input.lotId]);
      logger.info('LiveAuctioneers result recorded', {
        auctionId,
        lotId: input.lotId,
        outcome: result.data.outcome,
        hammerPrice: input.outcome === 'sold' ? input.hammerPrice : undefined,
        saleCompleted: result.data.saleCompleted,
        adminId: admin.id,
      });
      revalidatePublicCatalog(result.slug);
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    logger.error('Record LiveAuctioneers result error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
