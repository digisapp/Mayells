import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, estateVisitItems, users } from '@/db/schema';
import { eq, sql, and, asc, sum } from 'drizzle-orm';

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
    console.error('Items list error:', error);
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
    console.error('Items create error:', error);
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
    const body = await req.json();
    const { itemId, ...updates } = body;

    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const [updated] = await db
      .update(estateVisitItems)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(and(eq(estateVisitItems.id, itemId), eq(estateVisitItems.visitId, visitId)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await recalcTotals(visitId);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Item update error:', error);
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
    console.error('Item delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
