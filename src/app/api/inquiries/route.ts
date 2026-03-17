import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, inquiries } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getResend } from '@/lib/email/resend';
import { BUSINESS } from '@/lib/config';

const inquirySchema = z.object({
  lotId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  message: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success, remaining } = await rateLimit(`inquiry:${ip}`, {
      maxRequests: 10,
      windowSeconds: 3600,
    });
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600', 'X-RateLimit-Remaining': remaining.toString() } },
      );
    }

    const body = await req.json();
    const parsed = inquirySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Verify the lot exists and is a private sale
    const [lot] = await db.select().from(lots).where(eq(lots.id, parsed.data.lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (lot.saleType !== 'private') {
      return NextResponse.json({ error: 'This item is not available for private inquiry' }, { status: 400 });
    }

    // Persist the inquiry
    const [inquiry] = await db.insert(inquiries).values({
      lotId: parsed.data.lotId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      message: parsed.data.message || null,
    }).returning();

    // Send email notification to admin
    try {
      const resend = getResend();
      await resend.emails.send({
        from: `Mayell <notifications@mayellauctions.com>`,
        to: BUSINESS.email,
        subject: `Private Sale Inquiry: ${lot.title}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #272D35; font-size: 24px;">New Private Sale Inquiry</h1>
            <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 6px 12px; color: #666;">Item:</td><td style="padding: 6px 12px; font-weight: bold;">${lot.title}</td></tr>
              <tr><td style="padding: 6px 12px; color: #666;">From:</td><td style="padding: 6px 12px; font-weight: bold;">${parsed.data.name}</td></tr>
              <tr><td style="padding: 6px 12px; color: #666;">Email:</td><td style="padding: 6px 12px;">${parsed.data.email}</td></tr>
              ${parsed.data.phone ? `<tr><td style="padding: 6px 12px; color: #666;">Phone:</td><td style="padding: 6px 12px;">${parsed.data.phone}</td></tr>` : ''}
              ${parsed.data.message ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Message:</td><td style="padding: 6px 12px;">${parsed.data.message}</td></tr>` : ''}
            </table>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/lots/${lot.id}" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">
              View Lot in Admin
            </a>
            <p style="margin-top: 30px; font-size: 12px; color: #999;">Submitted via mayellauctions.com</p>
          </div>
        `,
      });
    } catch (emailError) {
      logger.error('Failed to send inquiry notification email', emailError, { inquiryId: inquiry.id });
    }

    return NextResponse.json({
      data: { message: 'Inquiry submitted successfully' },
    }, { status: 201 });
  } catch (error) {
    logger.error('Inquiry submission failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
