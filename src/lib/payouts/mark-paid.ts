/**
 * Record that consignor payouts were actually sent (wire / check / other).
 * Shared by the single and bulk admin routes so the guards are identical:
 *
 *  - only a `pending` payout can be marked paid (CAS on status, so two admins
 *    or a double-click can't record the payment twice);
 *  - the buyer's invoice must still be `paid` — never pay a consignor for a
 *    sale that has since been refunded;
 *  - the consignor gets one "payment sent" email per batch (skipped for
 *    shadow sellers with sentinel addresses).
 */

import { db } from '@/db';
import { payouts, invoices, lots, users, type Payout } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { sendPayoutSentNotification } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { portalUrl } from '@/lib/sellers/portal';
import { logger } from '@/lib/logger';

export type ManualPayoutMethod = 'wire' | 'check' | 'other';

export interface MarkPayoutsPaidInput {
  payoutIds: string[];
  method: ManualPayoutMethod;
  reference?: string | null;
  notes?: string | null;
  paidAt?: Date | null;
  adminId: string;
}

export interface MarkPayoutsPaidResult {
  paid: Payout[];
  skipped: { payoutId: string; reason: string }[];
  emailsSent: number;
}

export async function markPayoutsPaid(input: MarkPayoutsPaidInput): Promise<MarkPayoutsPaidResult> {
  const ids = Array.from(new Set(input.payoutIds));
  const result: MarkPayoutsPaidResult = { paid: [], skipped: [], emailsSent: 0 };
  if (ids.length === 0) return result;

  const rows = await db
    .select({
      payout: payouts,
      invoiceStatus: invoices.status,
      lotTitle: lots.title,
    })
    .from(payouts)
    .innerJoin(invoices, eq(payouts.invoiceId, invoices.id))
    .innerJoin(lots, eq(payouts.lotId, lots.id))
    .where(inArray(payouts.id, ids));

  const byId = new Map(rows.map((r) => [r.payout.id, r]));
  const paidAt = input.paidAt ?? new Date();
  const paidTitles = new Map<string, string>();

  for (const payoutId of ids) {
    const row = byId.get(payoutId);
    if (!row) {
      result.skipped.push({ payoutId, reason: 'Payout not found' });
      continue;
    }
    if (row.payout.status !== 'pending') {
      result.skipped.push({ payoutId, reason: `Payout is ${row.payout.status}, not pending` });
      continue;
    }
    if (row.invoiceStatus !== 'paid') {
      result.skipped.push({
        payoutId,
        reason: `Buyer's invoice is ${row.invoiceStatus} — the consignor must not be paid for this sale`,
      });
      continue;
    }

    // Guarded transition: only pending → paid, so a concurrent request loses.
    const [updated] = await db
      .update(payouts)
      .set({
        status: 'paid',
        method: input.method,
        reference: input.reference || null,
        notes: input.notes || null,
        paidAt,
        paidById: input.adminId,
        updatedAt: new Date(),
      })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, 'pending')))
      .returning();

    if (!updated) {
      result.skipped.push({ payoutId, reason: 'Payout was modified by someone else — reload and try again' });
      continue;
    }

    result.paid.push(updated);
    paidTitles.set(updated.id, row.lotTitle);
    logger.info('Payout marked paid', {
      payoutId,
      method: input.method,
      netAmount: updated.netAmount,
      by: input.adminId,
    });
  }

  // One "payment sent" email per consignor per batch.
  const bySeller = new Map<string, Payout[]>();
  for (const p of result.paid) {
    const list = bySeller.get(p.sellerId) ?? [];
    list.push(p);
    bySeller.set(p.sellerId, list);
  }

  for (const [sellerId, sellerPayouts] of bySeller) {
    try {
      const [seller] = await db
        .select({
          email: users.email,
          fullName: users.fullName,
          displayName: users.displayName,
          portalToken: users.portalToken,
        })
        .from(users)
        .where(eq(users.id, sellerId))
        .limit(1);
      if (!seller?.email || isSentinelEmail(seller.email)) {
        logger.warn('Skipping payout-sent email: no reachable email for seller', { sellerId });
        continue;
      }
      await sendPayoutSentNotification({
        email: seller.email,
        sellerName: seller.fullName || seller.displayName || 'Consignor',
        items: sellerPayouts.map((p) => ({ lotTitle: paidTitles.get(p.id) ?? 'Consigned item', netAmount: p.netAmount })),
        totalAmount: sellerPayouts.reduce((sum, p) => sum + p.netAmount, 0),
        method: input.method,
        reference: input.reference || null,
        paidAt,
        portalUrl: portalUrl(seller.portalToken),
      });
      result.emailsSent++;
    } catch (err) {
      // The payout is recorded; a failed email must not roll it back.
      logger.error('Payout-sent email failed', err, { sellerId });
    }
  }

  return result;
}
