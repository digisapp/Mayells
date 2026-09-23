import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { sellerProspects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { sendUploadLinkNotification } from '@/lib/email/notifications';
import { getOrCreateUploadLink } from '@/lib/prospects/intake';

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

    const { link, reused, url: uploadUrl } = await getOrCreateUploadLink(prospectId, { maxItems, expiresInDays });

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
