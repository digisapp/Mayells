import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { emails } from '@/db/schema';

/** The shape Resend posts (and what we store in webhook_logs.payload). */
export interface ResendEvent {
  type: string;
  data?: Record<string, unknown> | null;
}

export interface ResendEventResult {
  status: 'success' | 'ignored';
  relatedType?: 'email';
  relatedId?: string;
}

/**
 * Delivery-status events that are safe to run any number of times: they only
 * stamp a status onto the outbound email row Resend is reporting on. Shared by
 * the live inbound webhook and the admin replay route so a replay does exactly
 * what the original delivery did.
 *
 * `email.received` is deliberately NOT here — inbound processing fetches the
 * message body from Resend, stores it, forwards it and drafts a reply, none
 * of which may run twice. The webhook route handles it inline and the replay
 * route refuses it.
 */
export async function handleResendEvent(event: ResendEvent): Promise<ResendEventResult> {
  const emailId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
  if (!emailId) return { status: 'ignored' };

  const status = RESEND_STATUS_BY_EVENT[event.type];
  if (!status) return { status: 'ignored' };

  await db.update(emails).set({ status }).where(eq(emails.resendId, emailId));
  return { status: 'success', relatedType: 'email', relatedId: emailId };
}

const RESEND_STATUS_BY_EVENT: Record<string, 'delivered' | 'bounced' | undefined> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
};

/** Event types `handleResendEvent` acts on (everything else is ignored). */
export const HANDLED_RESEND_EVENT_TYPES = Object.keys(RESEND_STATUS_BY_EVENT);
