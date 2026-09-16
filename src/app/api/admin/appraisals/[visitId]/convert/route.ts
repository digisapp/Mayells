import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { estateVisits, estateVisitItems, sellerProspects, uploadLinks, uploadItems } from '@/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';

/**
 * Turn a finished estate appraisal into a seller prospect so the consignment
 * funnel (review → agreement → lots) can pick it up. The visit's AI results
 * are copied onto upload items as their `ai*` fields, already 'cataloged',
 * so the admin goes straight to accept/decline.
 */
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

    if (visit.prospectId) {
      return NextResponse.json({ data: { prospectId: visit.prospectId, existing: true, itemCount: 0 } });
    }
    if (visit.status !== 'review' && visit.status !== 'sent') {
      return NextResponse.json(
        { error: 'Finish the AI analysis before converting this visit to a prospect.' },
        { status: 409 },
      );
    }

    const items = await db
      .select()
      .from(estateVisitItems)
      .where(eq(estateVisitItems.visitId, visitId))
      .orderBy(asc(estateVisitItems.sortOrder));

    if (items.length === 0) {
      return NextResponse.json({ error: 'This visit has no items to convert.' }, { status: 409 });
    }

    const result = await db.transaction(async (tx) => {
      // Lock the visit row so two clicks can't mint two prospects.
      const [locked] = await tx
        .select({ prospectId: estateVisits.prospectId })
        .from(estateVisits)
        .where(eq(estateVisits.id, visitId))
        .for('update');
      if (locked?.prospectId) {
        return { prospectId: locked.prospectId, existing: true, itemCount: 0 };
      }

      const completed = items.filter((i) => i.status === 'completed');
      const totalEstimateLow = completed.reduce((s, i) => s + (i.estimateLow ?? 0), 0);
      const totalEstimateHigh = completed.reduce((s, i) => s + (i.estimateHigh ?? 0), 0);
      const visitLabel = (visit.visitDate ?? visit.createdAt ?? new Date()).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const now = new Date();

      const [prospect] = await tx
        .insert(sellerProspects)
        .values({
          fullName: visit.clientName,
          email: visit.clientEmail || null,
          phone: visit.clientPhone || null,
          address: visit.clientAddress || null,
          city: visit.clientCity || null,
          state: visit.clientState || null,
          source: 'estate_visit',
          sourceNotes: `Converted from the estate appraisal visit on ${visitLabel} (visit ${visit.id}).`,
          itemSummary: `${items.length} item${items.length !== 1 ? 's' : ''} photographed on site`,
          notes: visit.notes || null,
          status: 'under_review',
          totalItems: items.length,
          reviewedItems: 0,
          acceptedItems: 0,
          totalEstimateLow,
          totalEstimateHigh,
        })
        .returning({ id: sellerProspects.id });

      // A completed, never-shared upload link: purely the join the prospects
      // funnel expects, unusable on /upload/[token].
      const [link] = await tx
        .insert(uploadLinks)
        .values({
          prospectId: prospect.id,
          token: randomUUID(),
          status: 'completed',
          itemCount: items.length,
          lastUploadAt: now,
        })
        .returning({ id: uploadLinks.id });

      await tx.insert(uploadItems).values(
        items.map((it, index) => {
          const done = it.status === 'completed';
          return {
            uploadLinkId: link.id,
            prospectId: prospect.id,
            images: [it.imageUrl],
            sortOrder: index,
            // Items the AI never finished arrive as plain uploads so the
            // prospect's "Run AI" pass can pick them up.
            status: done ? ('cataloged' as const) : ('uploaded' as const),
            aiTitle: it.title,
            aiDescription: it.description,
            aiArtist: it.artist,
            aiPeriod: it.period,
            aiMedium: it.medium,
            aiDimensions: it.dimensions,
            aiCondition: it.condition,
            aiConditionNotes: it.conditionNotes,
            aiCategory: it.suggestedCategory,
            aiEstimateLow: it.estimateLow,
            aiEstimateHigh: it.estimateHigh,
            aiConfidence: it.confidence,
            aiReasoning: it.reasoning,
            aiMarketTrend: it.marketTrend,
            adminNotes: it.adminNotes,
            aiProcessedAt: done ? (it.updatedAt ?? now) : null,
          };
        }),
      );

      await tx
        .update(estateVisits)
        .set({ prospectId: prospect.id, updatedAt: sql`now()` })
        .where(eq(estateVisits.id, visitId));

      return { prospectId: prospect.id, existing: false, itemCount: items.length };
    });

    if (!result.existing) {
      logger.info('Estate visit converted to prospect', { visitId, prospectId: result.prospectId, items: result.itemCount });
    }

    return NextResponse.json({ data: result }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    logger.error('Convert visit to prospect error', error);
    return NextResponse.json({ error: 'Failed to convert visit to a prospect' }, { status: 500 });
  }
}
