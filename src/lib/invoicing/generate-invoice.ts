import { db } from '@/db';
import { invoices, lots, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

export async function generateInvoiceForWonLot(params: {
  auctionId: string;
  lotId: string;
  buyerId: string;
  hammerPrice: number;
}) {
  const { auctionId, lotId, buyerId, hammerPrice } = params;

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
}
