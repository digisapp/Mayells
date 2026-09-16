import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { sellerProspects, uploadLinks } from '@/db/schema';
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { sendUploadLinkNotification } from '@/lib/email/notifications';

const uploadLinkSchema = z.object({
  maxItems: z.number().int().min(1).max(1000).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  message: z.string().max(5000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    const parsed = uploadLinkSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { maxItems, expiresInDays, message } = parsed.data;

    // Look the prospect up before inserting anything so an unknown id is a
    // 404, not an FK error surfacing as a 500.
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Reuse a link that is still usable instead of minting a second one —
    // the seller may already have the first URL, and two live tokens for one
    // consignment is one more to expire later.
    const now = new Date();
    const [existing] = await db
      .select()
      .from(uploadLinks)
      .where(
        and(
          eq(uploadLinks.prospectId, prospectId),
          eq(uploadLinks.status, 'active'),
          or(isNull(uploadLinks.expiresAt), gt(uploadLinks.expiresAt, now)),
        ),
      )
      .orderBy(desc(uploadLinks.createdAt))
      .limit(1);

    let link = existing;
    let reused = true;

    if (!link) {
      reused = false;
      let expiresAt: Date | null = null;
      if (expiresInDays) {
        expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }
      [link] = await db
        .insert(uploadLinks)
        .values({
          prospectId,
          token: crypto.randomUUID(),
          maxItems: maxItems ?? null,
          expiresAt,
        })
        .returning();
    }

    // Only a fresh lead moves to upload_sent; a prospect that already has
    // items (or an agreement) must not be dragged back up the funnel by a
    // resend.
    await db
      .update(sellerProspects)
      .set({ status: 'upload_sent', updatedAt: now })
      .where(and(eq(sellerProspects.id, prospectId), inArray(sellerProspects.status, ['new', 'contacted'])));

    const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/upload/${link.token}`;

    // Resend the email even when the link was reused — that's the point of
    // clicking "send" again. Never email a sentinel (no-email) address.
    let emailed = false;
    if (prospect.email && !isSentinelEmail(prospect.email)) {
      try {
        await sendUploadLinkNotification({
          prospectEmail: prospect.email,
          prospectName: prospect.fullName,
          uploadUrl,
          message,
        });
        emailed = true;
      } catch (err) {
        logger.error('Failed to send upload link email', err, { prospectId });
      }
    }

    return NextResponse.json({
      data: {
        ...link,
        url: uploadUrl,
        reused,
        emailed,
      },
    });
  } catch (error) {
    logger.error('Admin create upload link error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
