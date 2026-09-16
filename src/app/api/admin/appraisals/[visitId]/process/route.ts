import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { estateVisits, estateVisitItems } from '@/db/schema';
import { eq, and, sql, sum, inArray } from 'drizzle-orm';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';

export const maxDuration = 60;

const BATCH_SIZE = 5;

interface ClaimedRow {
  id: string;
  image_url: string;
}

/** Sum completed estimates and move the visit to review. */
async function finalizeVisit(visitId: string) {
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

/** Items still waiting on (or inside) an AI run. */
async function remainingCount(visitId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(estateVisitItems)
    .where(and(eq(estateVisitItems.visitId, visitId), inArray(estateVisitItems.status, ['pending', 'processing'])));
  return row?.n ?? 0;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { visitId } = await params;
    if (!UUID_RE.test(visitId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [visit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
    if (!visit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (visit.status !== 'processing') {
      await db
        .update(estateVisits)
        .set({ status: 'processing', updatedAt: sql`now()` })
        .where(eq(estateVisits.id, visitId));
    }

    // Claim the next batch atomically. Two concurrent requests (the detail
    // page's auto-trigger racing a manual re-run, or two admins) each get a
    // disjoint set of rows: SKIP LOCKED steps over rows another transaction
    // is claiming, and the UPDATE flips them to 'processing' in the same
    // statement so a later SELECT can't see them as pending. An item left in
    // 'processing' for 15+ minutes belonged to a run that died and is
    // reclaimed.
    const claimed = await db.execute(sql`
      update estate_visit_items
         set status = 'processing', updated_at = now()
       where id in (
         select id
           from estate_visit_items
          where visit_id = ${visitId}
            and (
              status = 'pending'
              or (status = 'processing' and updated_at < now() - interval '15 minutes')
            )
          order by sort_order
          limit ${BATCH_SIZE}
          for update skip locked
       )
       returning id, image_url
    `);
    // node-postgres: db.execute() resolves to a pg QueryResult whose `rows` carry
    // the RETURNING columns.
    const batch = ((claimed as unknown as { rows?: ClaimedRow[] }).rows ?? []);

    if (batch.length === 0) {
      const remaining = await remainingCount(visitId);
      if (remaining > 0) {
        // Another run holds the rest; report progress and let the caller poll.
        return NextResponse.json({
          processedCount: visit.processedCount,
          itemCount: visit.itemCount,
          done: false,
          batchProcessed: 0,
          waiting: true,
        });
      }
      await finalizeVisit(visitId);
      const [fresh] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);
      return NextResponse.json({
        processedCount: fresh?.processedCount ?? visit.processedCount,
        itemCount: fresh?.itemCount ?? visit.itemCount,
        done: true,
        batchProcessed: 0,
      });
    }

    let batchProcessed = 0;

    for (const item of batch) {
      try {
        const catalog = await catalogLotFromImages([item.image_url]);

        const appraisal = await appraiseLot({
          imageUrls: [item.image_url],
          title: catalog.title,
          description: catalog.description,
          artist: catalog.artist,
          medium: catalog.medium,
          period: catalog.period,
          dimensions: catalog.dimensions,
          condition: catalog.condition,
        });

        await db
          .update(estateVisitItems)
          .set({
            status: 'completed',
            errorMessage: null,
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
      }
      batchProcessed++;

      // Live progress for the detail page's poll.
      await db
        .update(estateVisits)
        .set({
          processedCount: sql`${estateVisits.processedCount} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(estateVisits.id, visitId));
    }

    // Reconcile the counter with the rows themselves so a reclaimed item or a
    // crashed run can't leave it drifted.
    const [{ processed }] = await db
      .select({ processed: sql<number>`count(*)::int` })
      .from(estateVisitItems)
      .where(and(eq(estateVisitItems.visitId, visitId), inArray(estateVisitItems.status, ['completed', 'error'])));
    await db
      .update(estateVisits)
      .set({ processedCount: processed, updatedAt: sql`now()` })
      .where(eq(estateVisits.id, visitId));

    const remaining = await remainingCount(visitId);
    const done = remaining === 0;
    if (done) await finalizeVisit(visitId);

    const [updatedVisit] = await db.select().from(estateVisits).where(eq(estateVisits.id, visitId)).limit(1);

    return NextResponse.json({
      processedCount: updatedVisit?.processedCount ?? processed,
      itemCount: updatedVisit?.itemCount ?? visit.itemCount,
      done,
      batchProcessed,
    });
  } catch (error) {
    logger.error('Process error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
