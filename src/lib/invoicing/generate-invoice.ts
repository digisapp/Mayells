import { db } from '@/db';
import { invoices, auctions, automationSettings } from '@/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';

// Either the base db or an open transaction — both expose the same query API,
// so settlement can generate the invoice inside the same atomic unit as the
// lot/bid updates.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Statuses that no longer occupy the lot's one-live-invoice slot. */
export const DEAD_INVOICE_STATUSES = ['cancelled', 'refunded'] as const;

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  // 8 base-36 chars (~2.8e12 combinations) — a collision within a month is
  // vanishingly unlikely, which matters because we can no longer retry inside
  // the settlement transaction (see below).
  const random = Math.random().toString(36).substring(2, 10).toUpperCase().padEnd(8, '0');
  return `INV-${year}${month}-${random}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

/** Buyer's premium in cents, rounded half-up to the nearest cent. */
export function computeBuyerPremium(hammerPrice: number, premiumPercent: number): number {
  return Math.round((hammerPrice * premiumPercent) / 100);
}

export async function findLiveInvoiceForLot(executor: Executor, lotId: string) {
  const [existing] = await executor
    .select()
    .from(invoices)
    .where(and(eq(invoices.lotId, lotId), notInArray(invoices.status, [...DEAD_INVOICE_STATUSES])))
    .limit(1);
  return existing;
}

export async function generateInvoiceForWonLot(
  params: {
    auctionId: string;
    lotId: string;
    buyerId: string;
    hammerPrice: number;
  },
  executor: Executor = db,
) {
  const { auctionId, lotId, buyerId, hammerPrice } = params;

  // Idempotency: if a live invoice already exists for this lot, return it
  const existing = await findLiveInvoiceForLot(executor, lotId);
  if (existing) return existing;

  // Get auction for buyer premium percentage
  const [auction] = await executor
    .select()
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .limit(1);

  if (!auction) throw new Error('Auction not found');

  const premiumPercent = auction.buyerPremiumPercent ?? 25;
  const buyerPremium = computeBuyerPremium(hammerPrice, premiumPercent);
  const totalAmount = hammerPrice + buyerPremium;

  // Due date from automation settings (fallback: 7 days)
  const [settings] = await executor.select().from(automationSettings).limit(1);
  const dueDays = settings?.invoiceDueDays ?? 7;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  // Single attempt, no retry: this usually runs inside the settlement
  // transaction, and Postgres aborts the whole transaction on the first error
  // — a retry after a 23505 would fail with "current transaction is aborted"
  // and mask the real cause. The pre-check above handles the common replay
  // case; a genuine race on the per-lot unique index (or an invoice-number
  // collision) surfaces as an error and the lifecycle cron retries the lot on
  // its next tick, at which point the pre-check returns the winner.
  try {
    const [invoice] = await executor
      .insert(invoices)
      .values({
        invoiceNumber: generateInvoiceNumber(),
        buyerId,
        auctionId,
        lotId,
        hammerPrice,
        buyerPremium,
        totalAmount,
        dueDate,
      })
      .returning();

    return invoice;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error(
        `Invoice insert conflicted for lot ${lotId} (a concurrent settlement already invoiced it, or the invoice number collided) — will retry next tick`,
        { cause: err },
      );
    }
    throw err;
  }
}
