import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { uploadItems, sellerProspects } from '@/db/schema';
import { eq, and, or, inArray, lt, sql } from 'drizzle-orm';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';

export const maxDuration = 120;

// An item left in 'processing' this long was abandoned by a crashed or
// timed-out run and is picked up again.
const STUCK_PROCESSING_MS = 15 * 60 * 1000;

const bodySchema = z.object({
  // Explicit re-run for specific items (any reviewable status).
  itemIds: z.array(z.string().uuid()).min(1).max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { itemIds } = parsed.data;

    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const stuckBefore = new Date(Date.now() - STUCK_PROCESSING_MS);
    const stuckProcessing = and(eq(uploadItems.status, 'processing'), lt(uploadItems.updatedAt, stuckBefore));

    // Default run: everything not yet cataloged, plus runs that stalled.
    // Explicit re-run: the named items, as long as they haven't become lots
    // (and aren't genuinely mid-flight).
    const pendingItems = await db
      .select()
      .from(uploadItems)
      .where(
        itemIds
          ? and(
              eq(uploadItems.prospectId, prospectId),
              inArray(uploadItems.id, itemIds),
              or(
                inArray(uploadItems.status, ['uploaded', 'cataloged', 'declined', 'accepted']),
                stuckProcessing,
              ),
            )
          : and(
              eq(uploadItems.prospectId, prospectId),
              or(eq(uploadItems.status, 'uploaded'), stuckProcessing),
            ),
      )
      .orderBy(uploadItems.sortOrder);

    const total = pendingItems.length;
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Sequential so a large batch doesn't fan out against the AI API.
    for (const item of pendingItems) {
      // Nothing to analyze: decline the item (with a reason) instead of
      // leaving it 'uploaded' forever, which would keep the "run AI"
      // banner lit for an item that can never complete.
      if (!item.images || item.images.length === 0) {
        await db
          .update(uploadItems)
          .set({
            status: 'declined',
            adminNotes: item.adminNotes ? `${item.adminNotes}\nNo images` : 'No images',
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(uploadItems.id, item.id));
        skipped++;
        logger.warn(`Declined upload item ${item.id} — no images`);
        continue;
      }

      try {
        await db
          .update(uploadItems)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(uploadItems.id, item.id));

        const catalog = await catalogLotFromImages(item.images);

        const appraisal = await appraiseLot({
          imageUrls: item.images,
          title: catalog.title,
          artist: catalog.artist,
          medium: catalog.medium,
          period: catalog.period,
          dimensions: catalog.dimensions,
          condition: catalog.condition,
        });

        await db
          .update(uploadItems)
          .set({
            aiTitle: catalog.title,
            aiSubtitle: catalog.subtitle ?? null,
            aiDescription: catalog.description,
            aiArtist: catalog.artist ?? null,
            aiMaker: catalog.maker ?? null,
            aiPeriod: catalog.period ?? null,
            aiCirca: catalog.circa ?? null,
            aiOrigin: catalog.origin ?? null,
            aiMedium: catalog.medium ?? null,
            aiDimensions: catalog.dimensions ?? null,
            aiCondition: catalog.condition,
            aiConditionNotes: catalog.conditionNotes ?? null,
            aiCategory: catalog.suggestedCategory,
            aiTags: catalog.tags,

            aiEstimateLow: appraisal.estimateLow,
            aiEstimateHigh: appraisal.estimateHigh,
            aiConfidence: String(appraisal.confidence),
            aiReasoning: appraisal.reasoning,
            aiMarketTrend: appraisal.marketTrend,
            aiRecommendedReserve: appraisal.recommendedReserve,
            aiSuggestedStartingBid: appraisal.suggestedStartingBid,

            aiProcessedAt: new Date(),
            // A re-run returns the item to the review queue so the admin
            // looks at the fresh suggestions before accepting again.
            status: 'cataloged',
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(uploadItems.id, item.id));

        processed++;
      } catch (err) {
        logger.error(`AI processing failed for upload item ${item.id}`, err);
        await db
          .update(uploadItems)
          .set({ status: 'uploaded', updatedAt: new Date() })
          .where(eq(uploadItems.id, item.id));
        failed++;
      }
    }

    // Recount the prospect's aggregates with the same formula the review
    // endpoint uses: admin override wins over the AI estimate, declined
    // items don't count toward value but do count as reviewed.
    const [counts] = await db
      .select({
        reviewedItems: sql<number>`count(*) filter (where ${uploadItems.status} in ('accepted', 'declined', 'lot_created'))::int`,
        acceptedItems: sql<number>`count(*) filter (where ${uploadItems.status} in ('accepted', 'lot_created'))::int`,
        totalEstimateLow: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateLow}, ${uploadItems.aiEstimateLow})) filter (where ${uploadItems.status} != 'declined'), 0)::int`,
        totalEstimateHigh: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateHigh}, ${uploadItems.aiEstimateHigh})) filter (where ${uploadItems.status} != 'declined'), 0)::int`,
      })
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId));

    const prospectUpdate: Partial<typeof sellerProspects.$inferInsert> = {
      reviewedItems: counts.reviewedItems,
      acceptedItems: counts.acceptedItems,
      totalEstimateLow: counts.totalEstimateLow,
      totalEstimateHigh: counts.totalEstimateHigh,
      updatedAt: new Date(),
    };

    // Items received via the website form land as items_received; items
    // that arrive on a link while the prospect is still upload_sent (the
    // status flip races the upload) are covered too.
    if ((prospect.status === 'items_received' || prospect.status === 'upload_sent') && (processed > 0 || skipped > 0)) {
      prospectUpdate.status = 'under_review';
    }

    await db
      .update(sellerProspects)
      .set(prospectUpdate)
      .where(eq(sellerProspects.id, prospectId));

    return NextResponse.json({ processed, failed, skipped, total });
  } catch (error) {
    logger.error('Prospect batch processing error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
