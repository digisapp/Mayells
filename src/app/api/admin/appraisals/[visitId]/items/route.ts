import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, estateVisitItems, users } from '@/db/schema';
import { eq, sql, and, asc, sum } from 'drizzle-orm';
import { logger } from '@/lib/logger';

// All fields except status are nullable in the DB — null clears the column.
const itemPatchSchema = z.object({
  itemId: z.string().uuid('Valid item ID required'),
  status: z.enum(['pending', 'processing', 'completed', 'error']).optional(),
  title: z.string().max(500).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  artist: z.string().max(300).nullable().optional(),
  period: z.string().max(200).nullable().optional(),
  medium: z.string().max(300).nullable().optional(),
  dimensions: z.string().max(300).nullable().optional(),
  condition: z.string().max(200).nullable().optional(),
  conditionNotes: z.string().max(5000).nullable().optional(),
  suggestedCategory: z.string().max(200).nullable().optional(),
  estimateLow: z.number().int().min(0).nullable().optional(),
  estimateHigh: z.number().int().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1).transform(v => String(v)).nullable().optional(),
  reasoning: z.string().max(5000).nullable().optional(),
  marketTrend: z.string().max(1000).nullable().optional(),
  adminNotes: z.string().max(5000).nullable().optional(),
  errorMessage: z.string().max(2000).nullable().optional(),
});

const itemsCreateSchema = z.object({
  imageUrls: z.array(z.string().url().max(2048)).min(1, 'imageUrls required').max(200),
});

// Statuses that have been counted in estateVisits.processedCount
const isProcessedStatus = (status: string) => status === 'completed' || status === 'error';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || !isAdminProfile(profile)) return null;
  return profile;
}

async function recalcTotals(visitId: string) {
  const [totals] = await db
    .select({
      totalLow: sum(estateVisitItems.estimateLow),
      totalHigh: sum(estateVisitItems.estimateHigh),
    })
    .from(estateVisitItems)
    .where(and(eq(estateVisitItems.visitId, visitId), eq(estateVisitItems.status, 'completed')));

  await db
    .update(estateVisits)
    .set({
      totalEstimateLow: Number(totals?.totalLow) || 0,
      totalEstimateHigh: Number(totals?.totalHigh) || 0,
      updatedAt: sql`now()`,
    })
    .where(eq(estateVisits.id, visitId));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { visitId } = await params;

    const [visit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
    if (!visit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const items = await db
      .select()
      .from(estateVisitItems)
      .where(eq(estateVisitItems.visitId, visitId))
      .orderBy(asc(estateVisitItems.sortOrder));

    return NextResponse.json({
      data: items,
      visit,
      processedCount: visit.processedCount,
      itemCount: visit.itemCount,
    });
  } catch (error) {
    logger.error('Items list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { visitId } = await params;
    const parsed = itemsCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'imageUrls required' }, { status: 400 });
    }
    const { imageUrls } = parsed.data;

    const [visit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
    if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });

    const startOrder = visit.itemCount;

    const newItems = imageUrls.map((url, i) => ({
      visitId,
      imageUrl: url,
      sortOrder: startOrder + i,
    }));

    const inserted = await db.insert(estateVisitItems).values(newItems).returning();

    await db
      .update(estateVisits)
      .set({
        itemCount: visit.itemCount + imageUrls.length,
        status: 'uploading' as const,
        updatedAt: sql`now()`,
      })
      .where(eq(estateVisits.id, visitId));

    return NextResponse.json({ data: inserted }, { status: 201 });
  } catch (error) {
    logger.error('Items create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { visitId } = await params;
    const parsed = itemPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { itemId, ...updates } = parsed.data;

    const [existing] = await db
      .select({ status: estateVisitItems.status })
      .from(estateVisitItems)
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)))
      .limit(1);

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [updated] = await db
      .update(estateVisitItems)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Keep processedCount in sync when a processed item is reset for re-analysis
    if (isProcessedStatus(existing.status) && !isProcessedStatus(updated.status)) {
      await db
        .update(estateVisits)
        .set({
          processedCount: sql`greatest(${estateVisits.processedCount} - 1, 0)`,
          updatedAt: sql`now()`,
        })
        .where(eq(estateVisits.id, visitId));
    }

    await recalcTotals(visitId);

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Item update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { visitId } = await params;
    const body = await req.json();
    const { itemId } = body;

    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const [deleted] = await db
      .delete(estateVisitItems)
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)))
      .returning();

    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db
      .update(estateVisits)
      .set({
        itemCount: sql`greatest(${estateVisits.itemCount} - 1, 0)`,
        // Deleting an already-analyzed item must also decrement processedCount
        ...(isProcessedStatus(deleted.status)
          ? { processedCount: sql`greatest(${estateVisits.processedCount} - 1, 0)` }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(estateVisits.id, visitId));

    await recalcTotals(visitId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Item delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
