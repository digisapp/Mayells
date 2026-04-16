import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { outreachContacts, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { escapeHtml } from '@/lib/email/escape';
import { emails } from '@/db/schema';
import { logger } from '@/lib/logger';

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  contactId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = emailSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { to, subject, body, contactId } = parsed.data;

    const resend = getResend();
    const emailHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; white-space: pre-wrap; line-height: 1.6;">
          ${escapeHtml(body).replace(/\n/g, '<br />')}
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999;">
            Mayell — The Auction House of the Future<br />
            <a href="https://mayells.com" style="color: #D4C5A0;">mayells.com</a>
          </p>
        </div>
      `;
    const { data: sent } = await resend.emails.send({
      from: 'Mayell <outreach@mayells.com>',
      to,
      subject,
      html: emailHtml,
    });
    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      fromEmail: 'outreach@mayells.com',
      fromName: 'Mayell',
      toEmail: to,
      subject,
      bodyHtml: emailHtml,
      bodyText: body,
      status: 'sent',
    });

    // Update contact's lastContactedAt and status
    await db
      .update(outreachContacts)
      .set({
        lastContactedAt: sql`now()`,
        status: 'contacted',
        updatedAt: sql`now()`,
      })
      .where(eq(outreachContacts.id, contactId));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Outreach email error', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
