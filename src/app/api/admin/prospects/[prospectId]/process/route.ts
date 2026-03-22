import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { uploadItems, sellerProspects, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  try {
    // Auth check (admin only)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prospectId } = await params;

    // Verify prospect exists
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Get all uploaded (unprocessed) items for this prospect
    const pendingItems = await db
      .select()
      .from(uploadItems)
      .where(
        and(
          eq(uploadItems.prospectId, prospectId),
          eq(uploadItems.status, 'uploaded'),
        ),
      );

    const total = pendingItems.length;
    let processed = 0;
    let failed = 0;

    // Process items sequentially to avoid overwhelming the AI API
    for (const item of pendingItems) {
      // Skip items without images
      if (!item.images || item.images.length === 0) {
        failed++;
        logger.warn(`Skipping item ${item.id} — no images`);
        continue;
      }

      try {
        // 1. Mark as processing
        await db
          .update(uploadItems)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(uploadItems.id, item.id));

        // 2. Catalog from images
        const catalog = await catalogLotFromImages(item.images);

        // 3. Appraise using catalog results
        const appraisal = await appraiseLot({
          imageUrls: item.images,
          title: catalog.title,
          artist: catalog.artist,
          medium: catalog.medium,
          period: catalog.period,
          dimensions: catalog.dimensions,
          condition: catalog.condition,
        });

        // 4. Update item with all AI results
        await db
          .update(uploadItems)
          .set({
            // Catalog fields
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

            // Appraisal fields
            aiEstimateLow: appraisal.estimateLow,
            aiEstimateHigh: appraisal.estimateHigh,
            aiConfidence: String(appraisal.confidence),
            aiReasoning: appraisal.reasoning,
            aiMarketTrend: appraisal.marketTrend,
            aiRecommendedReserve: appraisal.recommendedReserve,
            aiSuggestedStartingBid: appraisal.suggestedStartingBid,

            aiProcessedAt: new Date(),
            status: 'cataloged',
            updatedAt: new Date(),
          })
          .where(eq(uploadItems.id, item.id));

        processed++;
      } catch (err) {
        // 5. On failure, reset status and continue
        logger.error(`AI processing failed for upload item ${item.id}`, err);
        await db
          .update(uploadItems)
          .set({ status: 'uploaded', updatedAt: new Date() })
          .where(eq(uploadItems.id, item.id));
        failed++;
      }
    }

    // Update prospect aggregate stats
    const allItems = await db
      .select()
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId));

    let totalEstimateLow = 0;
    let totalEstimateHigh = 0;

    for (const item of allItems) {
      totalEstimateLow += item.aiEstimateLow ?? 0;
      totalEstimateHigh += item.aiEstimateHigh ?? 0;
    }

    const prospectUpdate: Record<string, unknown> = {
      totalEstimateLow,
      totalEstimateHigh,
      updatedAt: new Date(),
    };

    if (prospect.status === 'items_received' && processed > 0) {
      prospectUpdate.status = 'under_review';
    }

    await db
      .update(sellerProspects)
      .set(prospectUpdate)
      .where(eq(sellerProspects.id, prospectId));

    return NextResponse.json({ processed, failed, total });
  } catch (error) {
    logger.error('Prospect batch processing error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
