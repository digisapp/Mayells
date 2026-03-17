import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, lotImages, bids, users } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { lotUpdateSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;

    const [lot] = await db
      .select()
      .from(lots)
      .where(eq(lots.id, lotId))
      .limit(1);

    if (!lot) {
      // Try by slug
      const [lotBySlug] = await db
        .select()
        .from(lots)
        .where(eq(lots.slug, lotId))
        .limit(1);

      if (!lotBySlug) {
        return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
      }

      const images = await db
        .select()
        .from(lotImages)
        .where(eq(lotImages.lotId, lotBySlug.id))
        .orderBy(lotImages.sortOrder);

      const bidHistory = await db
        .select()
        .from(bids)
        .where(eq(bids.lotId, lotBySlug.id))
        .orderBy(desc(bids.createdAt))
        .limit(20);

      return NextResponse.json({ data: { ...lotBySlug, images, bidHistory } });
    }

    const images = await db
      .select()
      .from(lotImages)
      .where(eq(lotImages.lotId, lot.id))
      .orderBy(lotImages.sortOrder);

    const bidHistory = await db
      .select()
      .from(bids)
      .where(eq(bids.lotId, lot.id))
      .orderBy(desc(bids.createdAt))
      .limit(20);

    return NextResponse.json({ data: { ...lot, images, bidHistory } });
  } catch (error) {
    logger.error('Get lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;
    const body = await req.json();
    const parsed = lotUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [updated] = await db
      .update(lots)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(lots.id, lotId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    if (lot.status === 'in_auction' || lot.status === 'sold') {
      return NextResponse.json(
        { error: `Cannot delete a lot that is ${lot.status.replace('_', ' ')}` },
        { status: 400 },
      );
    }

    await db.delete(lots).where(eq(lots.id, lotId));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
