import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lotImages, lots, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const imagePostSchema = z.object({
  url: z.string().url('Valid image URL required').max(2000),
  altText: z.string().max(500).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const imageDeleteSchema = z.object({
  imageId: z.string().uuid('Valid image ID required'),
});

export async function POST(
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
    const parsed = imagePostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { url, altText, isPrimary, sortOrder } = parsed.data;

    const [image] = await db
      .insert(lotImages)
      .values({
        lotId,
        url,
        altText: altText || null,
        isPrimary: isPrimary || false,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    // If primary, update the lot's primaryImageUrl
    if (isPrimary) {
      await db
        .update(lots)
        .set({ primaryImageUrl: url, updatedAt: sql`now()` })
        .where(eq(lots.id, lotId));
    }

    // Update image count
    await db
      .update(lots)
      .set({ imageCount: sql`${lots.imageCount} + 1`, updatedAt: sql`now()` })
      .where(eq(lots.id, lotId));

    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    logger.error('Add lot image error', error);
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
    const parsed = imageDeleteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { imageId } = parsed.data;

    const [deleted] = await db
      .delete(lotImages)
      .where(eq(lotImages.id, imageId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Update image count
    await db
      .update(lots)
      .set({ imageCount: sql`${lots.imageCount} - 1`, updatedAt: sql`now()` })
      .where(eq(lots.id, lotId));

    // If the deleted image was primary, clear the lot's primaryImageUrl
    if (deleted.isPrimary) {
      await db
        .update(lots)
        .set({ primaryImageUrl: null, updatedAt: sql`now()` })
        .where(eq(lots.id, lotId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot image error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
