import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users, consignments, lots, emails } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { escapeHtml } from '@/lib/email/escape';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FROM_EMAIL = 'notifications@mayells.com';

const summaryEmailSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(10000).optional(),
});

// Only statuses a consignor should ever see: drafts, review queues, and
// withdrawn/unsold items are internal.
const CLIENT_FACING_LOT_STATUSES = ['for_sale', 'in_auction', 'sold'] as const;

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(cents / 100);
}

const cell = 'padding: 8px; border-bottom: 1px solid #eee;';
const head = 'padding: 8px; border-bottom: 1px solid #ddd;';

/**
 * POST /api/admin/users/[userId]/email — send the consignor a summary of
 * their live/sold lots and consignments, with an optional personal note.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const parsed = summaryEmailSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { subject, message } = parsed.data;

    const [client] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!client) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (isSentinelEmail(client.email)) {
      return NextResponse.json(
        { error: 'This account has no email on file — add one to the prospect record first' },
        { status: 422 },
      );
    }

    const [clientLots, clientConsignments] = await Promise.all([
      db
        .select()
        .from(lots)
        .where(and(eq(lots.sellerId, userId), inArray(lots.status, [...CLIENT_FACING_LOT_STATUSES])))
        .orderBy(desc(lots.createdAt)),
      db
        .select()
        .from(consignments)
        .where(eq(consignments.sellerId, userId))
        .orderBy(desc(consignments.createdAt)),
    ]);

    let itemsHtml = '';

    if (clientLots.length > 0) {
      itemsHtml += '<h3 style="color: #333; margin-top: 24px;">Your Lots</h3>';
      itemsHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
      itemsHtml += `<tr style="background: #f5f5f0; text-align: left;"><th style="${head}">Item</th><th style="${head}">Status</th><th style="${head}">Estimate</th><th style="${head}">Hammer Price</th></tr>`;
      for (const lot of clientLots) {
        const estimate = lot.estimateLow && lot.estimateHigh
          ? `${formatCents(lot.estimateLow)} - ${formatCents(lot.estimateHigh)}`
          : '—';
        const hammer = lot.hammerPrice ? formatCents(lot.hammerPrice) : '—';
        itemsHtml += `<tr><td style="${cell}">${escapeHtml(lot.title)}</td><td style="${cell}">${lot.status.replace(/_/g, ' ')}</td><td style="${cell}">${estimate}</td><td style="${cell}">${hammer}</td></tr>`;
      }
      itemsHtml += '</table>';
    }

    if (clientConsignments.length > 0) {
      itemsHtml += '<h3 style="color: #333; margin-top: 24px;">Consignments</h3>';
      itemsHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
      itemsHtml += `<tr style="background: #f5f5f0; text-align: left;"><th style="${head}">Item</th><th style="${head}">Status</th><th style="${head}">Est. Value</th></tr>`;
      for (const c of clientConsignments) {
        const estValue = c.estimatedValue ? formatCents(c.estimatedValue) : '—';
        itemsHtml += `<tr><td style="${cell}">${escapeHtml(c.title)}</td><td style="${cell}">${c.status.replace(/_/g, ' ')}</td><td style="${cell}">${estValue}</td></tr>`;
      }
      itemsHtml += '</table>';
    }

    const customMessage = message
      ? `<p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message).replace(/\n/g, '<br />')}</p>`
      : '';

    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <p>Dear ${escapeHtml(client.fullName || 'Valued Client')},</p>
        ${customMessage}
        <p>Here is a summary of your items with Mayells:</p>
        ${itemsHtml || '<p style="color: #999;">No items on file.</p>'}
        <p style="margin-top: 24px;">If you have any questions, please don&rsquo;t hesitate to reach out.</p>
        <p>Best regards,<br />Mayells</p>
      </div>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future<br />
          <a href="${BUSINESS.url}" style="color: #D4C5A0;">mayells.com</a>
        </p>
      </div>
    `;

    const resend = getResend();
    const emailSubject = subject || 'Your Item Summary — Mayells';
    const { data: sent, error: sendError } = await resend.emails.send({
      from: `Mayells <${FROM_EMAIL}>`,
      to: client.email,
      replyTo: BUSINESS.email,
      subject: emailSubject,
      html,
    });

    if (sendError) {
      logger.error('Resend send error', sendError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail: FROM_EMAIL,
      fromName: 'Mayells',
      toEmail: client.email,
      toName: client.fullName,
      subject: emailSubject,
      bodyHtml: html,
      status: 'sent',
      userId: client.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('User summary email error', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
