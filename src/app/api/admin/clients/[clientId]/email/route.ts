import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, consignments, lots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { emails } from '@/db/schema';
import { logger } from '@/lib/logger';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(cents / 100);
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { clientId } = await params;
    const { subject, message } = await request.json();

    const [client] = await db.select().from(users).where(eq(users.id, clientId)).limit(1);
    if (!client || !client.email) {
      return NextResponse.json({ error: 'Client not found or has no email' }, { status: 404 });
    }

    const clientLots = await db
      .select()
      .from(lots)
      .where(eq(lots.sellerId, clientId))
      .orderBy(desc(lots.createdAt));

    const clientConsignments = await db
      .select()
      .from(consignments)
      .where(eq(consignments.sellerId, clientId))
      .orderBy(desc(consignments.createdAt));

    // Build item summary HTML
    let itemsHtml = '';

    if (clientLots.length > 0) {
      itemsHtml += '<h3 style="color: #333; margin-top: 24px;">Your Lots</h3>';
      itemsHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
      itemsHtml += '<tr style="background: #f5f5f0; text-align: left;"><th style="padding: 8px; border-bottom: 1px solid #ddd;">Item</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Status</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Estimate</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Hammer Price</th></tr>';
      for (const lot of clientLots) {
        const estimate = lot.estimateLow && lot.estimateHigh
          ? `${formatCents(lot.estimateLow)} - ${formatCents(lot.estimateHigh)}`
          : '—';
        const hammer = lot.hammerPrice ? formatCents(lot.hammerPrice) : '—';
        itemsHtml += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(lot.title)}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lot.status.replace(/_/g, ' ')}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${estimate}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${hammer}</td></tr>`;
      }
      itemsHtml += '</table>';
    }

    if (clientConsignments.length > 0) {
      itemsHtml += '<h3 style="color: #333; margin-top: 24px;">Consignments</h3>';
      itemsHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
      itemsHtml += '<tr style="background: #f5f5f0; text-align: left;"><th style="padding: 8px; border-bottom: 1px solid #ddd;">Item</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Status</th><th style="padding: 8px; border-bottom: 1px solid #ddd;">Est. Value</th></tr>';
      for (const c of clientConsignments) {
        const estValue = c.estimatedValue ? formatCents(c.estimatedValue) : '—';
        itemsHtml += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(c.title)}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${c.status.replace(/_/g, ' ')}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${estValue}</td></tr>`;
      }
      itemsHtml += '</table>';
    }

    const customMessage = message ? `<p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message).replace(/\n/g, '<br />')}</p>` : '';

    const html = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <p>Dear ${escapeHtml(client.fullName || 'Valued Client')},</p>
        ${customMessage}
        <p>Here is a summary of your items with Mayell:</p>
        ${itemsHtml || '<p style="color: #999;">No items on file.</p>'}
        <p style="margin-top: 24px;">If you have any questions, please don&rsquo;t hesitate to reach out.</p>
        <p>Best regards,<br />Mayell</p>
      </div>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999;">
          Mayell — The Auction House of the Future<br />
          <a href="https://mayellauctions.com" style="color: #D4C5A0;">mayellauctions.com</a>
        </p>
      </div>
    `;

    const resend = getResend();
    const emailSubject = subject || 'Your Item Summary — Mayell';
    const { data: sent } = await resend.emails.send({
      from: 'Mayell <outreach@mayellauctions.com>',
      to: client.email,
      subject: emailSubject,
      html,
    });
    db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail: 'outreach@mayellauctions.com',
      fromName: 'Mayell',
      toEmail: client.email,
      subject: emailSubject,
      bodyHtml: html,
      status: 'sent',
    }).catch((err) => console.error('Failed to log email:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Client email error', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
