import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { sellerProspects, uploadLinks, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { sendUploadLinkNotification } from '@/lib/email/notifications';
import crypto from 'crypto';

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
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prospectId } = await params;
    const body = await request.json();
    const { maxItems, expiresInDays } = body;

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

    const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`;

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
        message: body.message,
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
