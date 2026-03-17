import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, estateVisitItems, users } from '@/db/schema';
import { eq, and, asc, sql, sum } from 'drizzle-orm';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

const BATCH_SIZE = 5;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { visitId } = await params;

    const [visit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
    if (!visit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Set visit to processing
    if (visit.status !== 'processing') {
      await db
        .update(estateVisits)
        .set({ status: 'processing', updatedAt: sql`now()` })
        .where(eq(estateVisits.id, visitId));
    }

    // Get next batch of pending items
    const pendingItems = await db
      .select()
      .from(estateVisitItems)
      .where(and(eq(estateVisitItems.visitId, visitId), eq(estateVisitItems.status, 'pending')))
      .orderBy(asc(estateVisitItems.sortOrder))
      .limit(BATCH_SIZE);

    if (pendingItems.length === 0) {
      // All done — recalculate totals and set review
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
          status: 'review',
          totalEstimateLow: Number(totals?.totalLow) || 0,
          totalEstimateHigh: Number(totals?.totalHigh) || 0,
          updatedAt: sql`now()`,
        })
        .where(eq(estateVisits.id, visitId));

      return NextResponse.json({
        processedCount: visit.itemCount,
        itemCount: visit.itemCount,
        done: true,
      });
    }

    // Process each item in the batch
    let batchProcessed = 0;

    for (const item of pendingItems) {
      try {
        // Mark as processing
        await db
          .update(estateVisitItems)
          .set({ status: 'processing', updatedAt: sql`now()` })
          .where(eq(estateVisitItems.id, item.id));

        // Step 1: Catalog
        const catalog = await catalogLotFromImages([item.imageUrl]);

        // Step 2: Appraise (using catalog results as context)
        const appraisal = await appraiseLot({
          imageUrls: [item.imageUrl],
          title: catalog.title,
          description: catalog.description,
          artist: catalog.artist,
          medium: catalog.medium,
          period: catalog.period,
          dimensions: catalog.dimensions,
          condition: catalog.condition,
        });

        // Save results
        await db
          .update(estateVisitItems)
          .set({
            status: 'completed',
            title: catalog.title,
            description: catalog.description,
            artist: catalog.artist,
            period: catalog.period,
            medium: catalog.medium,
            dimensions: catalog.dimensions,
            condition: catalog.condition,
            conditionNotes: catalog.conditionNotes,
            suggestedCategory: catalog.suggestedCategory,
            estimateLow: appraisal.estimateLow,
            estimateHigh: appraisal.estimateHigh,
            confidence: String(appraisal.confidence),
            reasoning: appraisal.reasoning,
            marketTrend: appraisal.marketTrend,
            updatedAt: sql`now()`,
          })
          .where(eq(estateVisitItems.id, item.id));

        batchProcessed++;
      } catch (err) {
        logger.error(`AI processing failed for item ${item.id}`, err);
        await db
          .update(estateVisitItems)
          .set({
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
            updatedAt: sql`now()`,
          })
          .where(eq(estateVisitItems.id, item.id));
        batchProcessed++;
      }

      // Increment visit processedCount
      await db
        .update(estateVisits)
        .set({
          processedCount: sql`${estateVisits.processedCount} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(estateVisits.id, visitId));
    }

    // Get updated visit
    const [updatedVisit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
    const done = updatedVisit.processedCount >= updatedVisit.itemCount;

    if (done) {
      // Recalculate totals
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
          status: 'review',
          totalEstimateLow: Number(totals?.totalLow) || 0,
          totalEstimateHigh: Number(totals?.totalHigh) || 0,
          updatedAt: sql`now()`,
        })
        .where(eq(estateVisits.id, visitId));
    }

    return NextResponse.json({
      processedCount: updatedVisit.processedCount,
      itemCount: updatedVisit.itemCount,
      done,
      batchProcessed,
    });
  } catch (error) {
    logger.error('Process error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
