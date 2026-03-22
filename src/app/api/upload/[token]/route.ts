import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { uploadLinks, uploadItems, sellerProspects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { sendItemsReceivedNotification } from '@/lib/email/notifications';

async function validateLink(token: string) {
  const [row] = await db
    .select({
      link: uploadLinks,
      prospectName: sellerProspects.fullName,
    })
    .from(uploadLinks)
    .innerJoin(sellerProspects, eq(uploadLinks.prospectId, sellerProspects.id))
    .where(eq(uploadLinks.token, token))
    .limit(1);

  return row ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const row = await validateLink(token);

    if (!row) {
      return NextResponse.json({ error: 'Invalid upload link' }, { status: 404 });
    }

    const { link, prospectName } = row;

    // Check if expired
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      if (link.status === 'active') {
        await db
          .update(uploadLinks)
          .set({ status: 'expired' })
          .where(eq(uploadLinks.id, link.id));
      }
      return NextResponse.json({ error: 'This upload link has expired' }, { status: 410 });
    }

    if (link.status !== 'active') {
      return NextResponse.json({ error: 'This upload link is no longer active' }, { status: 410 });
    }

    return NextResponse.json({
      prospectName,
      maxItems: link.maxItems,
      itemCount: link.itemCount,
    });
  } catch (error) {
    logger.error('Upload link validation error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const row = await validateLink(token);

    if (!row) {
      return NextResponse.json({ error: 'Invalid upload link' }, { status: 404 });
    }

    const { link } = row;

    // Check if expired
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      if (link.status === 'active') {
        await db
          .update(uploadLinks)
          .set({ status: 'expired' })
          .where(eq(uploadLinks.id, link.id));
      }
      return NextResponse.json({ error: 'This upload link has expired' }, { status: 410 });
    }

    if (link.status !== 'active') {
      return NextResponse.json({ error: 'This upload link is no longer active' }, { status: 410 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required and must not be empty' }, { status: 400 });
    }

    // Check maxItems limit
    if (link.maxItems !== null && link.itemCount + items.length > link.maxItems) {
      return NextResponse.json(
        {
          error: `Exceeds maximum items. Limit: ${link.maxItems}, current: ${link.itemCount}, attempted: ${items.length}`,
        },
        { status: 400 }
      );
    }

    // Insert all items
    const itemsToInsert = items.map(
      (item: { images: string[]; sellerTitle?: string; sellerNotes?: string }, index: number) => ({
        uploadLinkId: link.id,
        prospectId: link.prospectId,
        images: item.images,
        sellerTitle: item.sellerTitle ?? null,
        sellerNotes: item.sellerNotes ?? null,
        sortOrder: index,
      })
    );

    await db.insert(uploadItems).values(itemsToInsert);

    // Update upload link stats
    await db
      .update(uploadLinks)
      .set({
        itemCount: sql`${uploadLinks.itemCount} + ${items.length}`,
        lastUploadAt: sql`now()`,
      })
      .where(eq(uploadLinks.id, link.id));

    // Update prospect stats and status
    await db
      .update(sellerProspects)
      .set({
        totalItems: sql`${sellerProspects.totalItems} + ${items.length}`,
        status: sql`CASE WHEN ${sellerProspects.status} = 'upload_sent' THEN 'items_received' ELSE ${sellerProspects.status} END`,
        updatedAt: sql`now()`,
      })
      .where(eq(sellerProspects.id, link.prospectId));

    logger.info('Items uploaded via token link', {
      token,
      linkId: link.id,
      prospectId: link.prospectId,
      count: items.length,
    });

    // Notify admin that items were uploaded
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, link.prospectId))
      .limit(1);

    if (prospect) {
      sendItemsReceivedNotification({
        prospectName: prospect.fullName,
        prospectEmail: prospect.email ?? undefined,
        itemCount: items.length,
        prospectId: prospect.id,
      }).catch((err) => logger.error('Failed to send items received notification', err));
    }

    return NextResponse.json({
      success: true,
      itemsUploaded: items.length,
    });
  } catch (error) {
    logger.error('Upload submission error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
