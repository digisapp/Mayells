import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { lotImages, lots, estateVisitItems, uploadItems } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeStoredImages, storagePathFromPublicUrl } from '@/lib/images/sanitize';
import { logger } from '@/lib/logger';

const BUCKET = 'lot-images';
// Keys our own upload routes mint: `<userId>/<ts>-<rand>.<ext>`.
const OWN_UPLOAD_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/**
 * Best-effort removal of a deleted image's storage object. Only objects the
 * admin/seller upload routes created (see OWN_UPLOAD_PATH_RE) are candidates:
 * consignor originals under `uploads/` and website submissions under
 * `submissions/` stay, since the prospect/appraisal record still shows them.
 * Even then an object still referenced by another lot image, a prospect
 * item, or an appraisal item is left alone. Logs and never throws — the DB
 * row is already gone and the request must not fail over storage.
 */
async function removeOrphanedStorageObject(url: string): Promise<void> {
  try {
    const path = storagePathFromPublicUrl(url);
    if (!path || !OWN_UPLOAD_PATH_RE.test(path)) return;

    const [lotRefs, heroRefs, visitRefs, prospectRefs] = await Promise.all([
      db.select({ id: lotImages.id }).from(lotImages).where(eq(lotImages.url, url)).limit(1),
      // A different lot may show this same URL as its hero image.
      db.select({ id: lots.id }).from(lots).where(eq(lots.primaryImageUrl, url)).limit(1),
      db.select({ id: estateVisitItems.id }).from(estateVisitItems).where(eq(estateVisitItems.imageUrl, url)).limit(1),
      db.select({ id: uploadItems.id }).from(uploadItems).where(sql`${url} = any(${uploadItems.images})`).limit(1),
    ]);
    if (lotRefs.length > 0 || heroRefs.length > 0 || visitRefs.length > 0 || prospectRefs.length > 0) return;

    const { error } = await createAdminClient().storage.from(BUCKET).remove([path]);
    if (error) logger.warn('Lot image storage cleanup failed', { path, error: error.message });
  } catch (err) {
    logger.warn('Lot image storage cleanup failed', { url, error: err instanceof Error ? err.message : String(err) });
  }
}

const imagePostSchema = z.object({
  url: z.string().url('Valid image URL required').max(2000),
  altText: z.string().max(500).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const imageDeleteSchema = z.object({
  imageId: z.string().uuid('Valid image ID required'),
});

const imageOrderSchema = z.object({
  order: z.array(z.string().uuid('Valid image ID required')).min(1).max(200),
});

/**
 * Resolve the lot (404 for a malformed id or a missing row) together with its
 * most relevant sale slug, so every mutation below can revalidate that sale's
 * catalogue page as well as the shared listing surfaces.
 */
async function loadLot(lotId: string) {
  if (!UUID_RE.test(lotId)) return null;
  const [row] = await db
    .select({ id: lots.id, auctionSlug: bestAuctionSlugSql })
    .from(lots)
    .where(eq(lots.id, lotId))
    .limit(1);
  return row ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    const lot = await loadLot(lotId);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

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

    // Admin uploads go straight to storage via signed URLs, so phone EXIF
    // (incl. GPS) is scrubbed here in the background — same path, so the
    // stored URL keeps working. A no-op for images already clean.
    const storagePath = storagePathFromPublicUrl(url);
    if (storagePath) after(() => sanitizeStoredImages([storagePath]));

    revalidatePublicCatalog(lot.auctionSlug);
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    logger.error('Add lot image error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH { order: imageId[] } — rewrite sortOrder to match the given sequence.
 * Ids the caller omits keep their relative order and are placed after the
 * listed ones, so a stale client can't accidentally strand an image.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    const lot = await loadLot(lotId);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const parsed = imageOrderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { order } = parsed.data;
    if (new Set(order).size !== order.length) {
      return NextResponse.json({ error: 'Image order contains duplicate ids' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: lotImages.id })
        .from(lotImages)
        .where(eq(lotImages.lotId, lotId))
        .orderBy(lotImages.sortOrder);
      const known = new Set(existing.map((row) => row.id));
      const unknown = order.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return { error: 'One or more images do not belong to this lot' } as const;
      }

      const listed = new Set(order);
      const finalOrder = [...order, ...existing.map((row) => row.id).filter((id) => !listed.has(id))];

      for (const [index, imageId] of finalOrder.entries()) {
        await tx
          .update(lotImages)
          .set({ sortOrder: index })
          .where(and(eq(lotImages.id, imageId), eq(lotImages.lotId, lotId)));
      }
      await tx.update(lots).set({ updatedAt: sql`now()` }).where(eq(lots.id, lotId));

      const images = await tx
        .select()
        .from(lotImages)
        .where(eq(lotImages.lotId, lotId))
        .orderBy(lotImages.sortOrder);
      return { images } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    revalidatePublicCatalog(lot.auctionSlug);
    return NextResponse.json({ data: result.images });
  } catch (error) {
    logger.error('Reorder lot images error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { lotId } = await params;
    const lot = await loadLot(lotId);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

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
        .set({ imageCount: sql`greatest(${lots.imageCount} - 1, 0)`, updatedAt: sql`now()` })
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

    await removeOrphanedStorageObject(deleted.url);

    revalidatePublicCatalog(lot.auctionSlug);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot image error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
