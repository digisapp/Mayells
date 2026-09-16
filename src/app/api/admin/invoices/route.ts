import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { invoices, payments, auctions } from '@/db/schema';
import { eq, and, sql, inArray, asc } from 'drizzle-orm';
import { processPaidInvoice } from '@/lib/payouts/service';
import { unwindPaidInvoice, cancelPendingInvoice, expireCheckoutSession } from '@/lib/invoicing/unwind';
import {
  parseInvoiceFilters,
  invoiceWhere,
  invoiceOrderBy,
  invoiceListQuery,
  invoiceCountQuery,
} from '@/lib/invoicing/admin-query';
import { stripe } from '@/lib/stripe/config';
import { logger } from '@/lib/logger';

const isoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Valid date required');

const invoicePatchSchema = z.object({
  id: z.string().uuid('Valid invoice ID required'),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled', 'refunded']).optional(),
  // Manual "mark paid"
  method: z.enum(['wire', 'check', 'other']).optional(),
  reference: z.string().trim().max(200).optional(),
  paidAt: isoDate.optional(),
  // "Extend" / edit due date
  dueDate: isoDate.optional(),
  // Cancel / refund
  reason: z.string().trim().max(500).optional(),
});

// Valid status transitions — refunded and cancelled are terminal.
// overdue → pending is "Extend" (requires a new future due date).
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled', 'overdue'],
  overdue: ['paid', 'cancelled', 'pending'],
  paid: ['refunded'],
  refunded: [],
  cancelled: [],
};

const PAGE_SIZE = 50;

// GET /api/admin/invoices?page=1&status=&auctionId=&q=&sort=
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;
    const filters = parseInvoiceFilters(sp);
    const where = invoiceWhere(filters);

    const [data, countResult, [stats], auctionOptions] = await Promise.all([
      invoiceListQuery()
        .where(where)
        .orderBy(...invoiceOrderBy(filters.sort))
        .limit(PAGE_SIZE)
        .offset(offset),
      invoiceCountQuery().where(where),
      // Global (not page- or filter-scoped) numbers for the header summary
      db
        .select({
          outstandingCount: sql<number>`count(*) filter (where ${invoices.status} in ('pending', 'overdue'))::int`,
          outstandingAmount: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} in ('pending', 'overdue')), 0)::int`,
          overdueCount: sql<number>`count(*) filter (where ${invoices.status} = 'overdue')::int`,
          overdueAmount: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'overdue'), 0)::int`,
          collectedAllTimeCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
          collectedAllTime: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'paid'), 0)::int`,
          collectedThisMonthCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid' and ${invoices.paidAt} >= date_trunc('month', now()))::int`,
          collectedThisMonth: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'paid' and ${invoices.paidAt} >= date_trunc('month', now())), 0)::int`,
          refundedCount: sql<number>`count(*) filter (where ${invoices.status} = 'refunded')::int`,
          refundedAmount: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'refunded'), 0)::int`,
        })
        .from(invoices),
      // Sales that have invoices, for the filter select
      db
        .selectDistinct({ id: auctions.id, title: auctions.title })
        .from(invoices)
        .innerJoin(auctions, eq(invoices.auctionId, auctions.id))
        .orderBy(asc(auctions.title)),
    ]);

    // count(*) can come back as a bigint string from the driver — normalise.
    const total = Number(countResult[0]?.count ?? 0);

    return NextResponse.json({
      data,
      stats,
      auctions: auctionOptions,
      filters,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Admin invoices fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/invoices — status transitions + due-date edits
export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = invoicePatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, status, method, reference, paidAt, dueDate, reason } = parsed.data;
    const adminLabel = admin.email;

    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Due-date-only edit (no status change)
    if (!status) {
      if (!dueDate) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
      }
      if (existing.status !== 'pending' && existing.status !== 'overdue') {
        return NextResponse.json(
          { error: `Cannot change the due date of a ${existing.status} invoice` },
          { status: 409 },
        );
      }
      const [updated] = await db
        .update(invoices)
        .set({ dueDate: new Date(dueDate), updatedAt: new Date() })
        .where(eq(invoices.id, id))
        .returning();
      return NextResponse.json({ data: updated });
    }

    if (status !== existing.status && !(STATUS_TRANSITIONS[existing.status] ?? []).includes(status)) {
      return NextResponse.json(
        { error: `Cannot change invoice status from "${existing.status}" to "${status}"` },
        { status: 409 },
      );
    }
    if (status === existing.status) {
      return NextResponse.json({ data: existing });
    }

    const conflict = () =>
      NextResponse.json(
        { error: 'Invoice was modified by someone else — reload and try again' },
        { status: 409 },
      );

    switch (status) {
      // ---- Manual "Mark paid" (wire / check / other) ---------------------
      case 'paid': {
        if (!method) {
          return NextResponse.json({ error: 'Payment method is required to mark an invoice paid' }, { status: 400 });
        }
        const paidDate = paidAt ? new Date(paidAt) : new Date();
        const note = `${new Date().toISOString().slice(0, 10)} Marked paid by ${adminLabel} (${method}${reference ? ` ${reference}` : ''})`;

        // Compare-and-swap on the status we validated against — two admins
        // racing (e.g. paid vs cancelled) must not both slip through.
        const [updated] = await db
          .update(invoices)
          .set({
            status: 'paid',
            paidAt: paidDate,
            notes: sql`concat_ws(chr(10), ${invoices.notes}, ${note})`,
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, id), eq(invoices.status, existing.status)))
          .returning();
        if (!updated) return conflict();

        // A buyer with the Stripe page still open must not be able to pay a
        // second time; the stray-payment auto-refund would catch it, but only
        // after their card was charged.
        await expireCheckoutSession(existing.stripeCheckoutSessionId, id);

        // The ledger row — idempotent per invoice so a replayed request
        // can't record the wire twice.
        await db
          .insert(payments)
          .values({
            invoiceId: id,
            buyerId: existing.buyerId,
            amount: existing.totalAmount,
            method,
            status: 'succeeded',
            reference: reference || null,
            idempotencyKey: `manual:${id}`,
          })
          .onConflictDoNothing();

        // Seller-side settlement (payout, shipment, statement) + buyer receipt.
        await processPaidInvoice(id, { sendBuyerConfirmation: true });
        return NextResponse.json({ data: updated });
      }

      // ---- Cancel an unpaid invoice ---------------------------------------
      case 'cancelled': {
        const result = await cancelPendingInvoice(id, reason || `cancelled by ${adminLabel}`);
        if (!result.cancelled) return conflict();
        const [updated] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
        return NextResponse.json({ data: updated, lot: result.lot });
      }

      // ---- Refund a paid invoice -------------------------------------------
      case 'refunded': {
        const refundReason = reason || `refunded by ${adminLabel}`;

        if (existing.stripePaymentIntentId) {
          // Card payment: ask Stripe, and let the charge.refunded webhook
          // drive our state so the dashboard and a manual refund converge on
          // exactly the same unwind path.
          try {
            const refund = await stripe.refunds.create(
              { payment_intent: existing.stripePaymentIntentId, reason: 'requested_by_customer' },
              { idempotencyKey: `refund:${id}` },
            );
            const note = `${new Date().toISOString().slice(0, 10)} Refund requested via Stripe by ${adminLabel} (${refund.id}): ${refundReason}`;
            await db
              .update(invoices)
              .set({ notes: sql`concat_ws(chr(10), ${invoices.notes}, ${note})`, updatedAt: new Date() })
              .where(eq(invoices.id, id));
            return NextResponse.json(
              {
                message: 'Refund requested; the invoice updates when Stripe confirms.',
                refundId: refund.id,
                data: existing,
              },
              { status: 202 },
            );
          } catch (err) {
            const stripeErr = err instanceof Stripe.errors.StripeError ? err : null;
            if (stripeErr?.code !== 'charge_already_refunded') {
              logger.error('Stripe refund failed', err, { invoiceId: id });
              return NextResponse.json(
                { error: `Stripe refund failed: ${stripeErr?.message ?? 'unreachable'}` },
                { status: 502 },
              );
            }
            // Already refunded in the Stripe dashboard but our webhook never
            // landed — fall through and unwind inline.
            logger.warn('Charge already refunded at Stripe — unwinding inline', { invoiceId: id });
          }
        }

        const result = await unwindPaidInvoice(id, refundReason);
        if (!result.unwound) return conflict();

        // Ledger: flip the recorded payment(s) to refunded; if the invoice was
        // marked paid before the ledger existed, write the refund row itself.
        const flipped = await db
          .update(payments)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(and(eq(payments.invoiceId, id), inArray(payments.status, ['succeeded', 'pending', 'processing'])))
          .returning({ id: payments.id });
        if (flipped.length === 0) {
          await db
            .insert(payments)
            .values({
              invoiceId: id,
              buyerId: existing.buyerId,
              amount: existing.totalAmount,
              method: 'other',
              status: 'refunded',
              reference: reference || null,
              idempotencyKey: `manual-refund:${id}`,
            })
            .onConflictDoNothing();
        }

        const [updated] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
        return NextResponse.json({ data: updated, unwind: result });
      }

      // ---- Extend: overdue → pending with a new due date ---------------------
      case 'pending': {
        if (!dueDate) {
          return NextResponse.json({ error: 'A new due date is required to extend an invoice' }, { status: 400 });
        }
        const newDue = new Date(dueDate);
        if (newDue.getTime() <= Date.now()) {
          return NextResponse.json({ error: 'The new due date must be in the future' }, { status: 400 });
        }
        const note = `${new Date().toISOString().slice(0, 10)} Extended to ${newDue.toISOString().slice(0, 10)} by ${adminLabel}`;
        const [updated] = await db
          .update(invoices)
          .set({
            status: 'pending',
            dueDate: newDue,
            // A fresh due date earns a fresh reminder if it lapses again.
            reminderSentAt: null,
            notes: sql`concat_ws(chr(10), ${invoices.notes}, ${note})`,
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, id), eq(invoices.status, existing.status)))
          .returning();
        if (!updated) return conflict();
        return NextResponse.json({ data: updated });
      }

      // ---- Manual pending → overdue -----------------------------------------
      case 'overdue': {
        const [updated] = await db
          .update(invoices)
          .set({ status: 'overdue', updatedAt: new Date() })
          .where(and(eq(invoices.id, id), eq(invoices.status, existing.status)))
          .returning();
        if (!updated) return conflict();
        return NextResponse.json({ data: updated });
      }
    }
  } catch (error) {
    logger.error('Admin invoice update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
