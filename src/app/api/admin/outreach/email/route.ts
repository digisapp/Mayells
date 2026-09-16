import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { outreachContacts, emails } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { escapeHtml } from '@/lib/email/escape';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { OUTREACH_NO_EMAIL_STATUSES } from '@/lib/config/outreach';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

const FROM_EMAIL = 'outreach@mayells.com';

const emailSchema = z.object({
  contactId: z.string().uuid(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  // Accepted for older clients but ignored: the recipient is always the
  // contact's stored address.
  to: z.string().optional(),
});

/**
 * POST /api/admin/outreach/email — send one outreach email to a contact.
 * Recipient comes from the record, opt-outs are honoured server-side, and the
 * status only moves forward from `new`; every send stamps lastContactedAt.
 */
export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = emailSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message, details: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
    }

    const { subject, body, contactId } = parsed.data;

    const [contact] = await db
      .select()
      .from(outreachContacts)
      .where(eq(outreachContacts.id, contactId))
      .limit(1);
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (OUTREACH_NO_EMAIL_STATUSES.includes(contact.status)) {
      return NextResponse.json(
        { error: `Contact is marked "${contact.status.replace(/_/g, ' ')}" and cannot be emailed` },
        { status: 422 },
      );
    }
    const to = contact.email?.trim();
    if (!to || isSentinelEmail(to)) {
      return NextResponse.json({ error: 'Contact has no email address on file' }, { status: 422 });
    }

    const resend = getResend();
    const emailHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; white-space: pre-wrap; line-height: 1.6;">
          ${escapeHtml(body).replace(/\n/g, '<br />')}
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999;">
            Mayells — The Auction House of the Future<br />
            <a href="${BUSINESS.url}" style="color: #D4C5A0;">mayells.com</a>
          </p>
        </div>
      `;
    const { data: sent, error: sendError } = await resend.emails.send({
      from: `Mayells <${FROM_EMAIL}>`,
      to,
      replyTo: BUSINESS.email,
      subject,
      html: emailHtml,
      text: body,
    });

    if (sendError) {
      // Don't log the email as sent or touch the contact — report the failure
      logger.error('Outreach Resend send error', sendError, { contactId });
      return NextResponse.json({ error: `Failed to send email to ${to}` }, { status: 500 });
    }

    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail: FROM_EMAIL,
      fromName: 'Mayells',
      toEmail: to,
      toName: contact.contactName,
      subject,
      bodyHtml: emailHtml,
      bodyText: body,
      status: 'sent',
    });

    const [updated] = await db
      .update(outreachContacts)
      .set({
        lastContactedAt: sql`now()`,
        ...(contact.status === 'new' && { status: 'contacted' as const }),
        updatedAt: sql`now()`,
      })
      .where(eq(outreachContacts.id, contactId))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Outreach email error', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
