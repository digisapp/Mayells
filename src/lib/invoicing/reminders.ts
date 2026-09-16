/**
 * Overdue invoice reminders (lifecycle cron).
 *
 * One reminder per invoice, ever: the cron flips pending → overdue when the
 * due date passes, then this sweep emails buyers whose invoice is `overdue`
 * and has never been reminded, and stamps `reminderSentAt` — only after the
 * send succeeded, so a Resend outage retries on the next tick. Capped per
 * run so a big sale can't eat the cron's time budget. Opted-out buyers and
 * sentinel (no-email) shadow accounts are excluded in the query itself so
 * they can never occupy the batch slots and starve everyone else.
 */

import { db } from '@/db';
import { invoices, users, lots } from '@/db/schema';
import { and, asc, eq, isNotNull, isNull, lte, notIlike, sql } from 'drizzle-orm';
import { sendInvoicePaymentReminder } from '@/lib/email/notifications';
import { isSentinelEmail, SHADOW_EMAIL_DOMAIN } from '@/lib/sellers/sentinel';
import { logger } from '@/lib/logger';

export const REMINDER_BATCH_SIZE = 50;
/** Wait this long after the due date before the first chase-up. */
export const REMINDER_GRACE_HOURS = 24;

export interface ReminderSweepResult {
  sent: number;
  skipped: number;
  errors: string[];
}

export async function sendOverdueInvoiceReminders(
  now: Date = new Date(),
  limit: number = REMINDER_BATCH_SIZE,
): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = { sent: 0, skipped: 0, errors: [] };

  const due = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      totalAmount: invoices.totalAmount,
      dueDate: invoices.dueDate,
      accessToken: invoices.accessToken,
      buyerEmail: users.email,
      emailNotifications: users.emailNotifications,
      lotTitle: lots.title,
    })
    .from(invoices)
    .innerJoin(users, eq(users.id, invoices.buyerId))
    .innerJoin(lots, eq(lots.id, invoices.lotId))
    .where(
      and(
        eq(invoices.status, 'overdue'),
        isNull(invoices.reminderSentAt),
        // The buyer must have received the invoice itself first.
        isNotNull(invoices.emailSentAt),
        lte(invoices.dueDate, new Date(now.getTime() - REMINDER_GRACE_HOURS * 60 * 60 * 1000)),
        // emailNotifications is nullable with a true default — null means opted in.
        sql`coalesce(${users.emailNotifications}, true) = true`,
        notIlike(users.email, `%@${SHADOW_EMAIL_DOMAIN}`),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(limit);

  for (const inv of due) {
    // Belt and braces — the query already excludes these.
    if (!inv.buyerEmail || isSentinelEmail(inv.buyerEmail) || inv.emailNotifications === false) {
      result.skipped++;
      continue;
    }
    try {
      await sendInvoicePaymentReminder({
        email: inv.buyerEmail,
        lotTitle: inv.lotTitle,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.totalAmount,
        dueDate: inv.dueDate,
        accessToken: inv.accessToken,
      });
      // Stamp only after a successful send; the isNull guard keeps a
      // concurrent run from double-stamping.
      await db
        .update(invoices)
        .set({ reminderSentAt: now, updatedAt: now })
        .where(and(eq(invoices.id, inv.id), isNull(invoices.reminderSentAt)));
      result.sent++;
    } catch (err) {
      result.errors.push(`Reminder for invoice ${inv.invoiceNumber} failed: ${err}`);
      logger.error('Overdue invoice reminder failed', err, { invoiceId: inv.id });
      // A permanently undeliverable address (malformed, rejected outright)
      // would otherwise sit at the head of the due-date ordering forever and
      // starve every newer reminder. Stamp it so the queue moves on; the
      // failure is in the cron result and the log either way.
      if (isPermanentSendFailure(err)) {
        await db
          .update(invoices)
          .set({ reminderSentAt: now, updatedAt: now })
          .where(and(eq(invoices.id, inv.id), isNull(invoices.reminderSentAt)))
          .catch(() => undefined);
      }
    }
  }

  return result;
}

/**
 * Resend rejected the address itself (validation / invalid recipient) rather
 * than failing transiently. Retrying such a send can only fail the same way.
 */
function isPermanentSendFailure(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes('validation_error') ||
    message.includes('invalid_parameter') ||
    message.includes('invalid `to`') ||
    message.includes('invalid email')
  );
}
