import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { uploadItems, sellerProspects, users } from '@/db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { prospectId } = await params;

    const items = await db
      .select()
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId))
      .orderBy(asc(uploadItems.sortOrder));

    return NextResponse.json({ items });
  } catch (error) {
    logger.error('GET prospect items error', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

export async function PATCH(
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
    const { items } = body as {
      items: Array<{
        id: string;
        action: 'accept' | 'decline';
        adminNotes?: string;
        finalTitle?: string;
        finalDescription?: string;
        finalEstimateLow?: number;
        finalEstimateHigh?: number;
        finalReserve?: number;
        finalCategory?: string;
      }>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    for (const item of items) {
      if (!item.id || !item.action || !['accept', 'decline'].includes(item.action)) {
        return NextResponse.json(
          { error: `Invalid item entry: each item needs an id and action (accept/decline)` },
          { status: 400 },
        );
      }
    }

    // Process each item
    for (const item of items) {
      const status = item.action === 'accept' ? 'accepted' : 'declined';

      await db
        .update(uploadItems)
        .set({
          status,
          reviewedAt: new Date(),
          updatedAt: new Date(),
          ...(item.adminNotes !== undefined && { adminNotes: item.adminNotes }),
          ...(item.finalTitle !== undefined && { finalTitle: item.finalTitle }),
          ...(item.finalDescription !== undefined && { finalDescription: item.finalDescription }),
          ...(item.finalEstimateLow !== undefined && { finalEstimateLow: item.finalEstimateLow }),
          ...(item.finalEstimateHigh !== undefined && { finalEstimateHigh: item.finalEstimateHigh }),
          ...(item.finalReserve !== undefined && { finalReserve: item.finalReserve }),
          ...(item.finalCategory !== undefined && { finalCategory: item.finalCategory }),
        })
        .where(and(eq(uploadItems.id, item.id), eq(uploadItems.prospectId, prospectId)));
    }

    // Recount accepted and reviewed items for the prospect
    const [counts] = await db
      .select({
        reviewedItems: sql<number>`count(*) filter (where ${uploadItems.status} in ('accepted', 'declined'))`.as('reviewed_items'),
        acceptedItems: sql<number>`count(*) filter (where ${uploadItems.status} = 'accepted')`.as('accepted_items'),
        totalEstimateLow: sql<number>`coalesce(sum(${uploadItems.finalEstimateLow}) filter (where ${uploadItems.status} = 'accepted'), 0)`.as('total_estimate_low'),
        totalEstimateHigh: sql<number>`coalesce(sum(${uploadItems.finalEstimateHigh}) filter (where ${uploadItems.status} = 'accepted'), 0)`.as('total_estimate_high'),
      })
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId));

    await db
      .update(sellerProspects)
      .set({
        reviewedItems: counts.reviewedItems,
        acceptedItems: counts.acceptedItems,
        totalEstimateLow: counts.totalEstimateLow,
        totalEstimateHigh: counts.totalEstimateHigh,
        updatedAt: new Date(),
      })
      .where(eq(sellerProspects.id, prospectId));

    return NextResponse.json({
      reviewedItems: counts.reviewedItems,
      acceptedItems: counts.acceptedItems,
      totalEstimateLow: counts.totalEstimateLow,
      totalEstimateHigh: counts.totalEstimateHigh,
    });
  } catch (error) {
    logger.error('PATCH prospect items error', error);
    return NextResponse.json({ error: 'Failed to update items' }, { status: 500 });
  }
}
