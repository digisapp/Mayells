import { NextRequest, NextResponse } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { BUSINESS } from '@/lib/config';
import { emails } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [profile] = await db.select().from(users).where(eq(users.id, user.id));
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { recipientName, recipientEmail } = body;

    if (!recipientEmail || !recipientName) {
      return NextResponse.json(
        { error: 'Recipient name and email are required' },
        { status: 400 },
      );
    }

    // HTML-escape user input to prevent XSS in emails
    const escapeHtml = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeName = escapeHtml(recipientName);

    const agreementUrl = `${BUSINESS.url}/consignment-agreement`;
    const resend = getResend();
    const emailSubject = `${BUSINESS.name} — Consignment Agreement for Your Review`;
    const emailHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
          <div style="text-align: center; padding: 30px 0; border-bottom: 2px solid #D4C5A0;">
            <h1 style="font-size: 28px; margin: 0; letter-spacing: 2px;">${BUSINESS.name}</h1>
            <p style="color: #D4C5A0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 4px;">
              Luxury Auctions & Fine Art
            </p>
          </div>

          <div style="padding: 30px 0;">
            <p>Dear ${safeName},</p>

            <p>
              Thank you for your interest in consigning with ${BUSINESS.name}. We are pleased to
              provide our Consignment Agreement for your review.
            </p>

            <p>
              Our agreement outlines the terms of consignment, including our commission structure,
              payment terms, insurance coverage, and your rights as a consignor. Key highlights include:
            </p>

            <ul style="color: #555; line-height: 1.8;">
              <li><strong>Commission:</strong> 35% of the gross hammer price</li>
              <li><strong>Payment:</strong> Within 35 business days of the sale</li>
              <li><strong>Insurance:</strong> Full coverage while in our custody</li>
              <li><strong>Reserve Price:</strong> Mutually agreed upon confidential minimum</li>
              <li><strong>Professional Photography & Cataloging:</strong> Included</li>
            </ul>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${agreementUrl}"
                 style="display: inline-block; background-color: #D4C5A0; color: #272D35; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; border-radius: 6px;">
                VIEW CONSIGNMENT AGREEMENT
              </a>
            </div>

            <p>
              If you have any questions or would like to schedule a consultation, please don&rsquo;t
              hesitate to reach out. We offer complimentary appraisals for all consignment inquiries.
            </p>

            <p>
              We look forward to working with you.
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
    const { data: sent } = await resend.emails.send({
      from: `${BUSINESS.name} <notifications@mayells.com>`,
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml,
    });
    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail: 'notifications@mayells.com',
      fromName: BUSINESS.name,
      toEmail: recipientEmail,
      subject: emailSubject,
      bodyHtml: emailHtml,
      status: 'sent',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Send agreement error', error);
    return NextResponse.json(
      { error: 'Failed to send agreement' },
      { status: 500 },
    );
  }
}
