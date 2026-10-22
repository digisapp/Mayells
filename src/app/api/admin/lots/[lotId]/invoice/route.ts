import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { invoices, lots, users } from '@/db/schema';
import { MAX_MONEY_CENTS } from '@/lib/validation/schemas';
import { findLiveInvoiceForLot, generateInvoiceNumber } from '@/lib/invoicing/generate-invoice';
import { isUniqueViolation } from '@/lib/auctions/db-errors';
import { stampNote } from '@/lib/invoicing/unwind';
import { sendInvoiceNotification } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

const cents = (max = MAX_MONEY_CENTS) => z.number().int().min(0).max(max, 'Amount is too large');

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter the client’s email address'),
  fullName: z.string().trim().max(200).optional(),
  price: cents().refine((v) => v > 0, 'Enter the sale price'),
  shippingCost: cents(),
  taxAmount: cents(),
  dueDays: z.number().int().min(1).max(60),
  note: z.string().trim().max(500).optional(),
});

class Refusal extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/**
 * POST /api/admin/lots/[lotId]/invoice — a specialist sells a gallery or
 * private-sale piece to a client: the client is emailed an invoice they can
 * pay by card or wire, and the piece shows as reserved until it is paid
 * (then sold) or the invoice is cancelled (then on sale again).
 *
 * A client with no account gets a buyer shadow row (no login behind it);
 * signing up later with the same email claims it, invoices included.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ lotId: string }> }) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    if (!UUID_RE.test(lotId)) return NextResponse.json({ error: 'Lot not found' }, { status: 404 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { email, fullName, price, shippingCost, taxAmount, dueDays, note } = parsed.data;

    const now = new Date();
    const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);

    let created: { invoice: typeof invoices.$inferSelect; buyerEmail: string; lotTitle: string };
    try {
      created = await db.transaction(async (tx) => {
        const [lot] = await tx.select().from(lots).where(eq(lots.id, lotId)).for('update');
        if (!lot) throw new Refusal('Lot not found', 404);
        if (lot.saleType !== 'gallery' && lot.saleType !== 'private') {
          throw new Refusal('Only gallery and private-sale pieces are invoiced here. Auction lots are invoiced when their sale settles.');
        }
        if (lot.status !== 'for_sale') {
          throw new Refusal('List the piece for sale before invoicing a client for it.');
        }
        const live = await findLiveInvoiceForLot(tx, lot.id);
        if (live) {
          throw new Refusal(
            live.holdExpiresAt
              ? `A buyer is checking out this piece online right now (invoice ${live.invoiceNumber}). Wait for it to complete or lapse.`
              : `Invoice ${live.invoiceNumber} already reserves this piece. Cancel it first.`,
          );
        }

        let [buyer] = await tx
          .select({ id: users.id, email: users.email, accountStatus: users.accountStatus })
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);
        if (!buyer) {
          [buyer] = await tx
            .insert(users)
            .values({ id: randomUUID(), email, fullName: fullName || null, role: 'buyer' })
            .returning({ id: users.id, email: users.email, accountStatus: users.accountStatus });
        } else if (fullName) {
          // Fill in a missing name; never overwrite one the client gave.
          await tx.update(users).set({ fullName, updatedAt: now }).where(and(eq(users.id, buyer.id), isNull(users.fullName)));
        }
        if (buyer.accountStatus !== 'active') throw new Refusal('That client’s account is suspended or banned.');
        if (lot.sellerId === buyer.id) throw new Refusal('That client consigned this piece.');

        const [invoice] = await tx
          .insert(invoices)
          .values({
            invoiceNumber: generateInvoiceNumber(),
            source: 'gallery',
            buyerId: buyer.id,
            lotId: lot.id,
            hammerPrice: price,
            buyerPremium: 0,
            shippingCost,
            taxAmount,
            totalAmount: price + shippingCost + taxAmount,
            dueDate,
            notes: stampNote('Invoiced', `by ${admin.email}${note ? ` — ${note}` : ''}`),
          })
          .returning();
        return { invoice, buyerEmail: buyer.email, lotTitle: lot.title };
      });
    } catch (err) {
      if (err instanceof Refusal) return NextResponse.json({ error: err.message }, { status: err.status });
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: 'Another invoice just reserved this piece. Reload the page.' }, { status: 409 });
      }
      throw err;
    }

    const { invoice, buyerEmail, lotTitle } = created;
    let emailed = false;
    if (!isSentinelEmail(buyerEmail)) {
      try {
        await sendInvoiceNotification({
          email: buyerEmail,
          lotTitle,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          dueDate: invoice.dueDate,
          accessToken: invoice.accessToken,
          source: 'gallery',
        });
        await db.update(invoices).set({ emailSentAt: new Date() }).where(eq(invoices.id, invoice.id));
        emailed = true;
      } catch (err) {
        // Unstamped, so the lifecycle cron retries the email.
        logger.error('Gallery invoice email failed — the cron will retry it', err, { invoiceId: invoice.id });
      }
    }

    return NextResponse.json({ data: invoice, emailed }, { status: 201 });
  } catch (error) {
    logger.error('Gallery invoice create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
