/**
 * Per-sale settlement report: everything an admin needs to reconcile one
 * auction after the hammer — lots sold/unsold, hammer/premium/commission
 * totals against estimate, and the invoice → payout → shipment chain per lot.
 *
 * Used by both the JSON route and the server-rendered settlement page.
 */

import { db } from '@/db';
import { auctions, auctionLots, lots, users, invoices, payouts, shipments } from '@/db/schema';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { DEAD_INVOICE_STATUSES } from './generate-invoice';

export interface SettlementLotRow {
  lotId: string;
  lotNumber: number;
  title: string;
  status: string;
  hammerPrice: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  buyer: { id: string; name: string | null; paddle: string | null; email: string } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    dueDate: Date;
    /** Cumulative Stripe partial refunds (cents); 0 unless part of the charge was refunded. */
    refundedAmount: number;
    /** Set while a chargeback is open (kept on a loss). */
    disputedAt: Date | null;
  } | null;
  payout: { id: string; status: string; netAmount: number } | null;
  shipment: { id: string; status: string; trackingNumber: string | null } | null;
}

export interface StatusBucket {
  count: number;
  amount: number;
}

export interface SettlementReport {
  auction: {
    id: string;
    title: string;
    slug: string;
    status: string;
    saleNumber: string | null;
    buyerPremiumPercent: number;
    biddingEndsAt: Date | null;
    actualEndedAt: Date | null;
  };
  lots: {
    offered: number;
    sold: number;
    unsold: number;
    withdrawn: number;
    /** Still in_auction (settlement not finished). */
    open: number;
  };
  totals: {
    hammer: number;
    premium: number;
    commission: number;
    /** Hammer + premium of invoices that are still live (not cancelled/refunded). */
    invoiced: number;
    estimateLow: number;
    estimateHigh: number;
    /** Sum of estimates for sold lots only, for a like-for-like comparison. */
    soldEstimateLow: number;
    soldEstimateHigh: number;
  };
  invoicesByStatus: Record<string, StatusBucket>;
  payoutsByStatus: Record<string, StatusBucket>;
  shipmentsByStatus: Record<string, number>;
  rows: SettlementLotRow[];
}

function bump(map: Record<string, StatusBucket>, key: string, amount: number) {
  const b = map[key] ?? { count: 0, amount: 0 };
  b.count += 1;
  b.amount += amount;
  map[key] = b;
}

export async function loadAuctionSettlement(auctionId: string): Promise<SettlementReport | null> {
  const [auction] = await db
    .select({
      id: auctions.id,
      title: auctions.title,
      slug: auctions.slug,
      status: auctions.status,
      saleNumber: auctions.saleNumber,
      buyerPremiumPercent: auctions.buyerPremiumPercent,
      biddingEndsAt: auctions.biddingEndsAt,
      actualEndedAt: auctions.actualEndedAt,
    })
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .limit(1);
  if (!auction) return null;

  const lotRows = await db
    .select({
      lotId: lots.id,
      lotNumber: auctionLots.lotNumber,
      title: lots.title,
      status: lots.status,
      hammerPrice: lots.hammerPrice,
      estimateLow: lots.estimateLow,
      estimateHigh: lots.estimateHigh,
      winnerId: lots.winnerId,
      winnerName: users.fullName,
      winnerPaddle: users.paddleNumber,
      winnerEmail: users.email,
    })
    .from(auctionLots)
    .innerJoin(lots, eq(lots.id, auctionLots.lotId))
    .leftJoin(users, eq(users.id, lots.winnerId))
    .where(eq(auctionLots.auctionId, auctionId))
    .orderBy(asc(auctionLots.lotNumber));

  const invoiceRows = await db
    .select({
      id: invoices.id,
      lotId: invoices.lotId,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      hammerPrice: invoices.hammerPrice,
      buyerPremium: invoices.buyerPremium,
      totalAmount: invoices.totalAmount,
      dueDate: invoices.dueDate,
      refundedAmount: invoices.refundedAmount,
      disputedAt: invoices.disputedAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.auctionId, auctionId))
    .orderBy(desc(invoices.createdAt));

  const invoiceIds = invoiceRows.map((i) => i.id);
  const [payoutRows, shipmentRows] = invoiceIds.length
    ? await Promise.all([
        db
          .select({
            id: payouts.id,
            invoiceId: payouts.invoiceId,
            status: payouts.status,
            netAmount: payouts.netAmount,
            commissionAmount: payouts.commissionAmount,
          })
          .from(payouts)
          .where(inArray(payouts.invoiceId, invoiceIds)),
        db
          .select({
            id: shipments.id,
            invoiceId: shipments.invoiceId,
            status: shipments.status,
            trackingNumber: shipments.trackingNumber,
            createdAt: shipments.createdAt,
          })
          .from(shipments)
          .where(inArray(shipments.invoiceId, invoiceIds))
          .orderBy(desc(shipments.createdAt)),
      ])
    : [[], []];

  // Per lot: prefer the live invoice; fall back to the most recent dead one so
  // a refunded sale still shows its history.
  const dead = new Set<string>(DEAD_INVOICE_STATUSES);
  const invoiceByLot = new Map<string, (typeof invoiceRows)[number]>();
  for (const inv of invoiceRows) {
    const current = invoiceByLot.get(inv.lotId);
    if (!current || (dead.has(current.status) && !dead.has(inv.status))) {
      invoiceByLot.set(inv.lotId, inv);
    }
  }
  const payoutByInvoice = new Map<string, (typeof payoutRows)[number]>();
  for (const p of payoutRows) {
    const current = payoutByInvoice.get(p.invoiceId);
    const deadPayout = (s: string) => s === 'cancelled' || s === 'reversed';
    if (!current || (deadPayout(current.status) && !deadPayout(p.status))) payoutByInvoice.set(p.invoiceId, p);
  }
  const shipmentByInvoice = new Map<string, (typeof shipmentRows)[number]>();
  for (const s of shipmentRows) {
    const current = shipmentByInvoice.get(s.invoiceId);
    if (!current || (current.status === 'cancelled' && s.status !== 'cancelled')) shipmentByInvoice.set(s.invoiceId, s);
  }

  const report: SettlementReport = {
    auction,
    lots: { offered: lotRows.length, sold: 0, unsold: 0, withdrawn: 0, open: 0 },
    totals: {
      hammer: 0,
      premium: 0,
      commission: 0,
      invoiced: 0,
      estimateLow: 0,
      estimateHigh: 0,
      soldEstimateLow: 0,
      soldEstimateHigh: 0,
    },
    invoicesByStatus: {},
    payoutsByStatus: {},
    shipmentsByStatus: {},
    rows: [],
  };

  for (const lot of lotRows) {
    report.totals.estimateLow += lot.estimateLow ?? 0;
    report.totals.estimateHigh += lot.estimateHigh ?? 0;

    if (lot.status === 'sold') {
      report.lots.sold += 1;
      report.totals.hammer += lot.hammerPrice ?? 0;
      report.totals.soldEstimateLow += lot.estimateLow ?? 0;
      report.totals.soldEstimateHigh += lot.estimateHigh ?? 0;
    } else if (lot.status === 'withdrawn') {
      report.lots.withdrawn += 1;
    } else if (lot.status === 'in_auction') {
      report.lots.open += 1;
    } else {
      // unsold / relisted to gallery / returned
      report.lots.unsold += 1;
    }

    const inv = invoiceByLot.get(lot.lotId) ?? null;
    const payout = inv ? payoutByInvoice.get(inv.id) ?? null : null;
    const shipment = inv ? shipmentByInvoice.get(inv.id) ?? null : null;

    report.rows.push({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      title: lot.title,
      status: lot.status,
      hammerPrice: lot.hammerPrice,
      estimateLow: lot.estimateLow,
      estimateHigh: lot.estimateHigh,
      buyer: lot.winnerId
        ? { id: lot.winnerId, name: lot.winnerName, paddle: lot.winnerPaddle, email: lot.winnerEmail ?? '' }
        : null,
      invoice: inv
        ? {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            totalAmount: inv.totalAmount,
            dueDate: inv.dueDate,
            refundedAmount: inv.refundedAmount,
            disputedAt: inv.disputedAt,
          }
        : null,
      payout: payout ? { id: payout.id, status: payout.status, netAmount: payout.netAmount } : null,
      shipment: shipment ? { id: shipment.id, status: shipment.status, trackingNumber: shipment.trackingNumber } : null,
    });
  }

  for (const inv of invoiceRows) {
    bump(report.invoicesByStatus, inv.status, inv.totalAmount);
    if (!dead.has(inv.status)) {
      report.totals.premium += inv.buyerPremium;
      report.totals.invoiced += inv.totalAmount;
    }
  }
  for (const p of payoutRows) {
    bump(report.payoutsByStatus, p.status, p.netAmount);
    if (p.status === 'pending' || p.status === 'paid') report.totals.commission += p.commissionAmount;
  }
  for (const s of shipmentRows) {
    report.shipmentsByStatus[s.status] = (report.shipmentsByStatus[s.status] ?? 0) + 1;
  }

  return report;
}
