import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { sellerProspects, users, emails } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getResend } from '@/lib/email/resend';
import { BUSINESS } from '@/lib/config';
import { formatCurrency } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { prospectId } = await params;
    const body = await req.json();
    const { commissionPercent, message } = body as {
      commissionPercent?: number;
      message?: string;
    };

    // Get the prospect
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    if (!prospect.email) {
      return NextResponse.json({ error: 'Prospect has no email address' }, { status: 400 });
    }

    if (!prospect.acceptedItems || prospect.acceptedItems <= 0) {
      return NextResponse.json({ error: 'Prospect has no accepted items' }, { status: 400 });
    }

    const commission = commissionPercent ?? prospect.agreedCommissionPercent ?? 35;
    const signUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/consignment-agreement?prospect=${prospectId}`;

    // Update the prospect
    await db
      .update(sellerProspects)
      .set({
        agreedCommissionPercent: commission,
        agreementSentAt: new Date(),
        status: 'agreement_sent',
        updatedAt: new Date(),
      })
      .where(eq(sellerProspects.id, prospectId));

    // HTML-escape user input
    const escapeHtml = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const safeName = escapeHtml(prospect.fullName);
    const safeMessage = message ? escapeHtml(message) : null;

    const emailSubject = `${BUSINESS.name} — Consignment Agreement for Your Review`;
    const emailHtml = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        <div style="text-align: center; padding: 30px 0; border-bottom: 2px solid #D4C5A0;">
          <h1 style="font-size: 28px; margin: 0; letter-spacing: 2px;">${BUSINESS.name}</h1>
          <p style="color: #D4C5A0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 4px;">
            Consignment Agreement
          </p>
        </div>

        <div style="padding: 30px 0;">
          <p>Dear ${safeName},</p>

          <p>
            Thank you for submitting your items to ${BUSINESS.name}. After careful review by our specialists,
            we are pleased to offer the following consignment terms:
          </p>

          <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
            <tr>
              <td style="padding: 8px 16px; color: #666;">Accepted Items:</td>
              <td style="padding: 8px 16px; font-weight: bold;">${prospect.acceptedItems}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; color: #666;">Estimated Total Value:</td>
              <td style="padding: 8px 16px; font-weight: bold; font-size: 18px;">
                ${formatCurrency(prospect.totalEstimateLow)} &ndash; ${formatCurrency(prospect.totalEstimateHigh)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; color: #666;">Commission Rate:</td>
              <td style="padding: 8px 16px; font-weight: bold;">${commission}%</td>
            </tr>
          </table>

          ${safeMessage ? `<p>${safeMessage}</p>` : ''}

          <p>Please review and sign the consignment agreement at your earliest convenience:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${signUrl}"
               style="display: inline-block; background-color: #D4C5A0; color: #272D35; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; border-radius: 6px;">
              REVIEW &amp; SIGN AGREEMENT
            </a>
          </div>

          <p style="font-size: 13px; color: #666;">
            If you have any questions about the terms, please don&rsquo;t hesitate to reach out.
          </p>

          <p style="margin-top: 30px;">
            Warm regards,<br />
            <strong>The ${BUSINESS.name} Team</strong><br />
            <span style="color: #888; font-size: 13px;">
              ${BUSINESS.phone} &bull; ${BUSINESS.email}
            </span>
          </p>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-size: 11px; color: #aaa;">
          <p>${BUSINESS.name} &bull; Palm Beach County, Florida</p>
        </div>
      </div>
    `;

    // Send email using sendAndLog pattern
    const resend = getResend();
    const fromEmail = 'notifications@mayells.com';
    const { data: sent } = await resend.emails.send({
      from: `${BUSINESS.name} <${fromEmail}>`,
      to: prospect.email,
      subject: emailSubject,
      html: emailHtml,
    });

    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail,
      fromName: BUSINESS.name,
      toEmail: prospect.email,
      subject: emailSubject,
      bodyHtml: emailHtml,
      status: 'sent',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Send prospect agreement error', error);
    return NextResponse.json({ error: 'Failed to send agreement' }, { status: 500 });
  }
}
