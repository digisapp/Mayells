import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, estateVisitItems, users } from '@/db/schema';
import { eq, sql, and, asc, sum } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const itemPatchSchema = z.object({
  itemId: z.string().uuid('Valid item ID required'),
  status: z.enum(['pending', 'processing', 'completed', 'error']).optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  artist: z.string().max(300).optional(),
  period: z.string().max(200).optional(),
  medium: z.string().max(300).optional(),
  dimensions: z.string().max(300).optional(),
  condition: z.string().max(200).optional(),
  conditionNotes: z.string().max(5000).optional(),
  suggestedCategory: z.string().max(200).optional(),
  estimateLow: z.number().int().min(0).optional(),
  estimateHigh: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).transform(v => String(v)).optional(),
  reasoning: z.string().max(5000).optional(),
  marketTrend: z.string().max(1000).optional(),
  errorMessage: z.string().max(2000).optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
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
    const body = await req.json();
    const { imageUrls } = body as { imageUrls: string[] };

    if (!imageUrls?.length) {
      return NextResponse.json({ error: 'imageUrls required' }, { status: 400 });
    }

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

    const [updated] = await db
      .update(estateVisitItems)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

    await db
      .delete(estateVisitItems)
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)));

    await db
      .update(estateVisits)
      .set({
        itemCount: sql`${estateVisits.itemCount} - 1`,
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
