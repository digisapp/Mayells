import { db } from '@/db';
import { invoices, auctions } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
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

export async function generateInvoiceForWonLot(params: {
  auctionId: string;
  lotId: string;
  buyerId: string;
  hammerPrice: number;
}) {
  const { auctionId, lotId, buyerId, hammerPrice } = params;

  // Idempotency: if a live invoice already exists for this lot, return it
  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.lotId, lotId), ne(invoices.status, 'cancelled')))
    .limit(1);

  if (existing) return existing;

  // Get auction for buyer premium percentage
  const [auction] = await db
    .select()
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .limit(1);

  if (!auction) throw new Error('Auction not found');

  const premiumPercent = auction.buyerPremiumPercent ?? 25;
  const buyerPremium = Math.round(hammerPrice * (premiumPercent / 100));
  const totalAmount = hammerPrice + buyerPremium;

  // Due date is 7 days from now
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  // Retry on invoice number collision (unique constraint)
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [invoice] = await db
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
      lastError = err;
      if (!isUniqueViolation(err)) throw err;
    }
  }

  throw lastError;
}
