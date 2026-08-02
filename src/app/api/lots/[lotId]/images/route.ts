import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lotImages, lots, users } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
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
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;
    const parsed = imagePostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { url, altText, isPrimary, sortOrder } = parsed.data;

    const image = await db.transaction(async (tx) => {
      // If primary, demote any existing primary so exactly one row carries it
      if (isPrimary) {
        await tx
          .update(lotImages)
          .set({ isPrimary: false })
          .where(and(eq(lotImages.lotId, lotId), eq(lotImages.isPrimary, true)));
      }

      const [inserted] = await tx
        .insert(lotImages)
        .values({
          lotId,
          url,
          altText: altText || null,
          isPrimary: isPrimary || false,
          sortOrder: sortOrder ?? 0,
        })
        .returning();

      // Update image count, and the lot's primaryImageUrl if primary
      await tx
        .update(lots)
        .set({
          imageCount: sql`${lots.imageCount} + 1`,
          ...(isPrimary ? { primaryImageUrl: url } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(lots.id, lotId));

      return inserted;
    });

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
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;
    const parsed = imageDeleteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { imageId } = parsed.data;

    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(lotImages)
        .where(and(eq(lotImages.id, imageId), eq(lotImages.lotId, lotId)))
        .returning();

      if (!row) return null;

      // Update image count
      await tx
        .update(lots)
        .set({ imageCount: sql`${lots.imageCount} - 1`, updatedAt: sql`now()` })
        .where(eq(lots.id, lotId));

      // If the deleted image was primary, promote the next image; clear the
      // lot's primaryImageUrl only when no images remain
      if (row.isPrimary) {
        const [next] = await tx
          .select()
          .from(lotImages)
          .where(eq(lotImages.lotId, lotId))
          .orderBy(lotImages.sortOrder)
          .limit(1);

        if (next) {
          await tx
            .update(lotImages)
            .set({ isPrimary: true })
            .where(eq(lotImages.id, next.id));
        }
        await tx
          .update(lots)
          .set({ primaryImageUrl: next?.url ?? null, updatedAt: sql`now()` })
          .where(eq(lots.id, lotId));
      }

      return row;
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot image error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
