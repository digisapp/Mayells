import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { uploadLinks, uploadItems, sellerProspects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { sendItemsReceivedNotification } from '@/lib/email/notifications';
import { validateLink } from '@/lib/upload/validate-link';
import { sanitizeStoredImages, storagePathFromPublicUrl } from '@/lib/images/sanitize';
import { MAX_ITEMS_PER_SEND, MAX_MEDIA_PER_ITEM, MAX_NOTE_CHARS } from '@/lib/upload/limits';
import { planUploadItems } from '@/lib/upload/resubmission';

const uploadItemsSchema = z.object({
  items: z
    .array(
      z.object({
        images: z
          .array(z.string().url().max(2000))
          .min(1)
          .max(MAX_MEDIA_PER_ITEM, `Each item can have up to ${MAX_MEDIA_PER_ITEM} photos. Please remove a few.`),
        sellerTitle: z.string().max(300).optional().nullable(),
        sellerNotes: z.string().max(MAX_NOTE_CHARS, 'Please keep each note under 5,000 characters.').optional().nullable(),
      }),
    )
    .min(1, 'Items array is required and must not be empty')
    .max(MAX_ITEMS_PER_SEND, `Please send at most ${MAX_ITEMS_PER_SEND} items at a time.`),
});

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
    const parsed = uploadItemsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.issues },
        { status: 400 },
      );
    }
    const { items } = parsed.data;

    // Only photos this link's own signed URLs produced. Anything else would
    // let a token holder point items at arbitrary URLs, or have the sanitizer
    // below re-encode (and overwrite) objects that belong to other lots.
    const ownPrefix = `uploads/${link.prospectId}/`;
    const foreign = items
      .flatMap((item) => item.images)
      .find((url) => {
        const path = storagePathFromPublicUrl(url);
        return !path || !path.startsWith(ownPrefix) || path.includes('..');
      });
    if (foreign) {
      return NextResponse.json({ error: 'One of the photos did not come from this upload link. Please upload it again.' }, { status: 400 });
    }

    // A send whose reply was lost (the phone locked after we saved it) comes
    // back with the same photos, and every uploaded file has its own storage
    // path. So only what the link doesn't already have is added, and a resend
    // of a saved send changes nothing and gets the same answer. The advisory
    // lock makes two sends on one link take turns, so a double tap or a
    // retry racing the original can't both insert.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`upload-link:${link.id}`}::text))`);

      const [current] = await tx
        .select({ itemCount: uploadLinks.itemCount })
        .from(uploadLinks)
        .where(eq(uploadLinks.id, link.id))
        .limit(1);
      const itemCount = current?.itemCount ?? link.itemCount;
      const stored = await tx
        .select({ id: uploadItems.id, images: uploadItems.images, sellerNotes: uploadItems.sellerNotes })
        .from(uploadItems)
        .where(eq(uploadItems.uploadLinkId, link.id));
      const plan = planUploadItems(items, stored, storagePathFromPublicUrl);

      // Counted against what's new, so resending a send that filled the
      // link isn't refused as over the limit.
      if (link.maxItems !== null && itemCount + plan.insert.length > link.maxItems) {
        return { plan, remaining: Math.max(0, link.maxItems - itemCount), refused: true as const };
      }

      if (plan.insert.length > 0) {
        // Continue the prospect's sort order across batches. Restarting at 0
        // for every batch interleaved later uploads with earlier ones in
        // admin review.
        const [{ maxSortOrder }] = await tx
          .select({ maxSortOrder: sql<number>`coalesce(max(${uploadItems.sortOrder}), -1)` })
          .from(uploadItems)
          .where(eq(uploadItems.prospectId, link.prospectId));
        const baseOrder = Number(maxSortOrder) + 1;

        await tx.insert(uploadItems).values(
          plan.insert.map((item, index) => ({
            uploadLinkId: link.id,
            prospectId: link.prospectId,
            images: item.images,
            sellerTitle: item.sellerTitle ?? null,
            sellerNotes: item.sellerNotes ?? null,
            sortOrder: baseOrder + index,
          })),
        );
      }

      for (const change of plan.update) {
        await tx
          .update(uploadItems)
          .set({
            images: change.images,
            ...(change.sellerNotes ? { sellerNotes: change.sellerNotes } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(uploadItems.id, change.id));
      }

      if (plan.insert.length > 0 || plan.update.length > 0) {
        await tx
          .update(uploadLinks)
          .set({
            itemCount: sql`${uploadLinks.itemCount} + ${plan.insert.length}`,
            lastUploadAt: sql`now()`,
          })
          .where(eq(uploadLinks.id, link.id));
      }

      if (plan.insert.length > 0) {
        await tx
          .update(sellerProspects)
          .set({
            totalItems: sql`${sellerProspects.totalItems} + ${plan.insert.length}`,
            status: sql`CASE WHEN ${sellerProspects.status} = 'upload_sent' THEN 'items_received' ELSE ${sellerProspects.status} END`,
            updatedAt: sql`now()`,
          })
          .where(eq(sellerProspects.id, link.prospectId));
      }

      return { plan, refused: false as const };
    });

    if (outcome.refused) {
      const { remaining } = outcome;
      return NextResponse.json(
        {
          error: remaining > 0
            ? `This link can take ${remaining} more ${remaining === 1 ? 'item' : 'items'}. Remove some, or call us for a new link.`
            : 'This link has reached its item limit. Call us and we will send you a new one.',
        },
        { status: 400 }
      );
    }
    const { plan } = outcome;

    // Photos went straight to storage via signed URLs, so EXIF (incl. GPS of
    // the seller's home) is scrubbed here in the background — same paths, so
    // the stored URLs keep working. HEIC has its Exif/XMP blanked in place;
    // videos are skipped here because the upload page strips their location
    // on the phone. Only newly added photos: a resent one was scrubbed with
    // the send that brought it.
    const storagePaths = [...plan.insert.flatMap((item) => item.images), ...plan.update.flatMap((u) => u.added)]
      .map(storagePathFromPublicUrl)
      .filter((p): p is string => p !== null);
    if (storagePaths.length > 0) {
      after(() => sanitizeStoredImages(storagePaths));
    }

    logger.info('Items uploaded via token link', {
      token,
      linkId: link.id,
      prospectId: link.prospectId,
      count: plan.insert.length,
      updated: plan.update.length,
      alreadyStored: plan.alreadyStored,
    });

    // Tell the admin about new items after the response: the seller's phone
    // shouldn't wait on an email (the longer it waits, the likelier it locks
    // and loses the reply), and after() keeps the work alive past it.
    const newItems = plan.insert.length;
    if (newItems > 0) {
      after(async () => {
        try {
          const [prospect] = await db
            .select({ id: sellerProspects.id, fullName: sellerProspects.fullName, email: sellerProspects.email })
            .from(sellerProspects)
            .where(eq(sellerProspects.id, link.prospectId))
            .limit(1);
          if (!prospect) return;
          await sendItemsReceivedNotification({
            prospectName: prospect.fullName,
            prospectEmail: prospect.email ?? undefined,
            itemCount: newItems,
            prospectId: prospect.id,
          });
        } catch (err) {
          logger.error('Failed to send items received notification', err);
        }
      });
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
