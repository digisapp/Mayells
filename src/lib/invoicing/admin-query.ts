/**
 * Shared filter parsing + query for the admin invoices list and its CSV
 * export, so both honour exactly the same filters.
 */

import { db } from '@/db';
import { invoices, users, lots, auctions, auctionLots, payments, invoiceStatusEnum } from '@/db/schema';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type InvoiceSort = 'created_desc' | 'due_asc' | 'due_desc';

export interface InvoiceListFilters {
  status: InvoiceStatus | null;
  auctionId: string | null;
  search: string | null;
  sort: InvoiceSort;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseInvoiceFilters(sp: URLSearchParams): InvoiceListFilters {
  const statusParam = sp.get('status');
  const status = invoiceStatusEnum.enumValues.find((s) => s === statusParam) ?? null;
  const auctionParam = sp.get('auctionId');
  const auctionId = auctionParam && UUID_RE.test(auctionParam) ? auctionParam : null;
  // `q` is the canonical search param (the inbox, users and webhooks pages
  // link here with ?q=); `search` is kept as an alias for older links.
  const search = (sp.get('q') ?? sp.get('search'))?.trim().slice(0, 200) || null;
  const sortParam = sp.get('sort');
  const sort: InvoiceSort =
    sortParam === 'due_asc' || sortParam === 'due_desc' ? sortParam : 'created_desc';
  return { status, auctionId, search, sort };
}

export function invoiceWhere(f: InvoiceListFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (f.status) conditions.push(eq(invoices.status, f.status));
  if (f.auctionId) conditions.push(eq(invoices.auctionId, f.auctionId));
  if (f.search) {
    const pattern = `%${f.search}%`;
    const matches: SQL[] = [
      ilike(invoices.invoiceNumber, pattern),
      ilike(users.email, pattern),
      ilike(users.fullName, pattern),
      ilike(lots.title, pattern),
    ];
    // The webhooks page links with the invoice's UUID (its related_id).
    if (UUID_RE.test(f.search)) matches.push(eq(invoices.id, f.search));
    conditions.push(or(...matches)!);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export function invoiceOrderBy(sort: InvoiceSort) {
  switch (sort) {
    case 'due_asc':
      return [asc(invoices.dueDate), desc(invoices.createdAt)];
    case 'due_desc':
      return [desc(invoices.dueDate), desc(invoices.createdAt)];
    default:
      return [desc(invoices.createdAt)];
  }
}

// Everything the admin list and CSV render. accessToken is exposed to admins
// on purpose: it is the buyer's pay link (/invoices/{token}) for "copy link".
export const invoiceListColumns = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  accessToken: invoices.accessToken,
  hammerPrice: invoices.hammerPrice,
  buyerPremium: invoices.buyerPremium,
  shippingCost: invoices.shippingCost,
  insuranceCost: invoices.insuranceCost,
  taxAmount: invoices.taxAmount,
  totalAmount: invoices.totalAmount,
  status: invoices.status,
  dueDate: invoices.dueDate,
  paidAt: invoices.paidAt,
  emailSentAt: invoices.emailSentAt,
  createdAt: invoices.createdAt,
  notes: invoices.notes,
  hasStripePayment: invoices.stripePaymentIntentId,
  // Cumulative Stripe partial refunds (cents) — "Partially refunded $X" pill.
  refundedAmount: invoices.refundedAmount,
  // Open (or lost) chargeback — "Disputed" pill.
  disputedAt: invoices.disputedAt,
  // A succeeded payment whose amount differs from the invoice total (Stripe
  // charged more/less than we invoiced) — "Reconcile" pill.
  amountMismatch: sql<boolean>`exists (
    select 1 from ${payments}
    where ${payments.invoiceId} = ${invoices.id}
      and ${payments.status} = 'succeeded'
      and ${payments.amount} <> ${invoices.totalAmount}
  )`,
  buyerId: invoices.buyerId,
  buyerName: users.fullName,
  buyerEmail: users.email,
  buyerPaddle: users.paddleNumber,
  lotId: invoices.lotId,
  lotTitle: lots.title,
  lotNumber: auctionLots.lotNumber,
  auctionId: invoices.auctionId,
  auctionTitle: auctions.title,
};

/** Base query with every join the filters and columns need. */
export function invoiceListQuery() {
  return db
    .select(invoiceListColumns)
    .from(invoices)
    .innerJoin(users, eq(invoices.buyerId, users.id))
    .innerJoin(lots, eq(invoices.lotId, lots.id))
    .leftJoin(auctions, eq(invoices.auctionId, auctions.id))
    .leftJoin(
      auctionLots,
      and(eq(auctionLots.auctionId, invoices.auctionId), eq(auctionLots.lotId, invoices.lotId)),
    );
}

/** Same joins as the list (so the filters apply), returning only the row count. */
export function invoiceCountQuery() {
  return db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .innerJoin(users, eq(invoices.buyerId, users.id))
    .innerJoin(lots, eq(invoices.lotId, lots.id));
}
