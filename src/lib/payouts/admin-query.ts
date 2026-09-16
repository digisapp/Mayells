/**
 * Shared filter parsing + query for the admin payouts list and its CSV
 * export, so both honour exactly the same filters.
 */

import { db } from '@/db';
import { payouts, users, lots, invoices, auctions, payoutStatusEnum } from '@/db/schema';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

export type PayoutStatus = (typeof payoutStatusEnum.enumValues)[number];

export interface PayoutListFilters {
  status: PayoutStatus | null;
  sellerId: string | null;
  auctionId: string | null;
  search: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePayoutFilters(sp: URLSearchParams): PayoutListFilters {
  const statusParam = sp.get('status');
  const status = payoutStatusEnum.enumValues.find((s) => s === statusParam) ?? null;
  const sellerParam = sp.get('sellerId');
  const auctionParam = sp.get('auctionId');
  return {
    status,
    sellerId: sellerParam && UUID_RE.test(sellerParam) ? sellerParam : null,
    auctionId: auctionParam && UUID_RE.test(auctionParam) ? auctionParam : null,
    // `q` is canonical; `search` kept as an alias for older links.
    search: (sp.get('q') ?? sp.get('search'))?.trim().slice(0, 200) || null,
  };
}

export function payoutWhere(f: PayoutListFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (f.status) conditions.push(eq(payouts.status, f.status));
  if (f.sellerId) conditions.push(eq(payouts.sellerId, f.sellerId));
  if (f.auctionId) conditions.push(eq(invoices.auctionId, f.auctionId));
  if (f.search) {
    const pattern = `%${f.search}%`;
    conditions.push(
      or(
        ilike(users.fullName, pattern),
        ilike(users.email, pattern),
        ilike(lots.title, pattern),
        ilike(invoices.invoiceNumber, pattern),
        ilike(payouts.reference, pattern),
      )!,
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

export const payoutListColumns = {
  payout: {
    id: payouts.id,
    status: payouts.status,
    hammerPrice: payouts.hammerPrice,
    commissionPercent: payouts.commissionPercent,
    commissionAmount: payouts.commissionAmount,
    commissionSource: payouts.commissionSource,
    netAmount: payouts.netAmount,
    method: payouts.method,
    reference: payouts.reference,
    notes: payouts.notes,
    paidAt: payouts.paidAt,
    statementSentAt: payouts.statementSentAt,
    createdAt: payouts.createdAt,
  },
  seller: { id: users.id, fullName: users.fullName, email: users.email },
  lot: { id: lots.id, title: lots.title },
  invoice: { id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status },
  auction: { id: auctions.id, title: auctions.title },
};

/** Grouped by consignor: seller name, then newest first within the group. */
export const payoutListOrder = [asc(users.fullName), asc(users.email), desc(payouts.createdAt)];

export function payoutListQuery() {
  return db
    .select(payoutListColumns)
    .from(payouts)
    .innerJoin(users, eq(payouts.sellerId, users.id))
    .innerJoin(lots, eq(payouts.lotId, lots.id))
    .innerJoin(invoices, eq(payouts.invoiceId, invoices.id))
    .leftJoin(auctions, eq(invoices.auctionId, auctions.id));
}

/** Same joins as the list (so the filters apply), returning only the row count. */
export function payoutCountQuery() {
  return db
    .select({ count: sql<number>`count(*)::int` })
    .from(payouts)
    .innerJoin(users, eq(payouts.sellerId, users.id))
    .innerJoin(lots, eq(payouts.lotId, lots.id))
    .innerJoin(invoices, eq(payouts.invoiceId, invoices.id));
}
