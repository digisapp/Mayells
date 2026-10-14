import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { escapeHtml } from '@/lib/email/escape';
import { listForwardableAttachments, type ForwardableAttachment } from '@/lib/email/notifications';
import { ADMIN_FROM_NAME, getAdminFrom, getAdminFromAddress, threadReplyAddress } from '@/lib/email/addresses';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const forwardSchema = z.object({
  to: z.string().email('Valid recipient email required').max(320),
  subject: z.string().min(1).max(500),
  /** The operator's note plus the quoted original, composed client-side. */
  text: z.string().min(1).max(100_000),
  /** Re-send the original inbound attachments (fresh Resend signed URLs). */
  includeAttachments: z.boolean().default(true),
  /** Extra files the operator attached in the composer. */
  attachments: z.array(z.object({
    content: z.string().max(10_000_000), // base64, ~7.5MB decoded
    filename: z.string().max(255),
    contentType: z.string().max(100).optional(),
  })).max(5).optional(),
});

/**
 * POST /api/admin/emails/[id]/forward — send a stored email on to a third
 * party. The body (headers block + quoted original) is composed client-side;
 * this route re-attaches the original inbound files as fresh Resend-hosted
 * signed URLs — the same relay the inbound webhook uses for the owner's
 * mailbox, 30 MB cap included — and logs the outbound row as a conversation
 * of its own, linked to the original so the original's thread shows where it
 * went.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid email id' }, { status: 400 });
    }

    const parsed = forwardSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { to, subject, text, includeAttachments, attachments } = parsed.data;

    if (isSentinelEmail(to)) {
      return NextResponse.json({ error: 'This account has no email on file' }, { status: 422 });
    }

    const [original] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only inbound mail has files on Resend's receiving side; an outbound
    // row's resendId is a send id and has nothing to list.
    let relayed: ForwardableAttachment[] = [];
    let skipped = 0;
    const hasStoredAttachments = Array.isArray(original.attachments) && original.attachments.length > 0;
    if (includeAttachments && original.direction === 'inbound' && original.resendId && hasStoredAttachments) {
      try {
        ({ attachments: relayed, skipped } = await listForwardableAttachments(original.resendId));
      } catch (attErr) {
        logger.error('Failed to fetch attachments for forward', attErr, { emailId: id });
        return NextResponse.json(
          { error: 'Could not fetch the original attachments from Resend. Try again, or forward without them.' },
          { status: 502 },
        );
      }
    }

    const skippedNote = skipped > 0
      ? `${skipped} original attachment${skipped === 1 ? ' was' : 's were'} too large to forward.`
      : '';
    const bodyText = skippedNote ? `${text}\n\n[${skippedNote}]` : text;
    const bodyHtml =
      `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(text).replace(/\n/g, '<br />')}</div>` +
      (skippedNote ? `<p style="font-size: 12px; color: #666;">${escapeHtml(skippedNote)}</p>` : '');

    const outgoingAttachments = [
      ...relayed,
      ...(attachments ?? []).map((a) => ({
        content: Buffer.from(a.content, 'base64'),
        filename: a.filename,
        ...(a.contentType && { contentType: a.contentType }),
      })),
    ];

    // A forward is a fresh conversation with the recipient, rooted at the
    // forward itself. Stored inside the customer's thread it would make the
    // recipient a participant there: their answer would join the customer's
    // conversation, and Reply, AI drafts and auto-replies would go to them
    // with the customer's history. Replies come back tagged with this
    // conversation; inReplyToId still points at the original, so its thread
    // can say where it went.
    const forwardId = randomUUID();

    const resend = getResend();
    const sendPayload = {
      from: getAdminFrom(),
      to,
      replyTo: threadReplyAddress(forwardId),
      subject,
      html: bodyHtml,
      text: bodyText,
      ...(outgoingAttachments.length > 0 ? { attachments: outgoingAttachments } : {}),
    } as Parameters<typeof resend.emails.send>[0];

    const { data: sent, error: sendError } = await resend.emails.send(sendPayload);
    if (sendError) {
      logger.error('Resend forward error', sendError, { emailId: id });
      return NextResponse.json(
        {
          error: relayed.length > 0
            ? 'Failed to send — Resend rejected the message. Try again without the original attachments.'
            : 'Failed to send email',
        },
        { status: 502 },
      );
    }

    // An unopened original counts as read — it has clearly been handled.
    if (original.direction === 'inbound' && !original.readAt) {
      await db
        .update(emails)
        .set({ readAt: new Date(), ...(original.status === 'received' && { status: 'read' as const }) })
        .where(eq(emails.id, original.id));
    }

    const [saved] = await db.insert(emails).values({
      id: forwardId,
      resendId: sent?.id || null,
      direction: 'outbound',
      status: 'sent',
      fromEmail: getAdminFromAddress(),
      fromName: ADMIN_FROM_NAME,
      toEmail: to,
      subject,
      bodyHtml,
      bodyText,
      inReplyToId: original.id,
      threadId: forwardId,
    }).returning();

    return NextResponse.json({
      data: saved,
      attachments: { forwarded: relayed.length, skipped },
    });
  } catch (error) {
    logger.error('Admin email forward error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
