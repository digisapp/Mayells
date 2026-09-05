import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { sellerProspects, uploadLinks, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { sendUploadLinkNotification } from '@/lib/email/notifications';
import crypto from 'crypto';
import { z } from 'zod';

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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    const parsed = uploadLinkSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { maxItems, expiresInDays, message } = parsed.data;

    const token = crypto.randomUUID();

    let expiresAt: Date | undefined;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const [link] = await db
      .insert(uploadLinks)
      .values({
        prospectId,
        token,
        maxItems: maxItems ?? null,
        expiresAt: expiresAt ?? null,
      })
      .returning();

    await db
      .update(sellerProspects)
      .set({ status: 'upload_sent' })
      .where(eq(sellerProspects.id, prospectId));

    const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/upload/${token}`;

    // Send email to prospect if they have an email
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (prospect?.email) {
      sendUploadLinkNotification({
        prospectEmail: prospect.email,
        prospectName: prospect.fullName,
        uploadUrl,
        message,
      }).catch((err) => logger.error('Failed to send upload link email', err));
    }

    return NextResponse.json({
      data: {
        ...link,
        url: uploadUrl,
      },
    });
  } catch (error) {
    logger.error('Admin create upload link error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
