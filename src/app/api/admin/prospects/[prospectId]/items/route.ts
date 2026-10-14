import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { uploadItems, sellerProspects } from '@/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { MAX_MONEY_CENTS } from '@/lib/validation/schemas';
import { reviewCountsSelect } from '@/lib/prospects/totals';

const money = () => z.number().int().min(0).max(MAX_MONEY_CENTS, 'Amount is too large');

const itemReviewSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid('Valid item ID required'),
    // reset: send an accepted/declined item back to the review queue.
    action: z.enum(['accept', 'decline', 'reset']),
    adminNotes: z.string().max(5000).optional(),
    finalTitle: z.string().max(500).optional(),
    finalDescription: z.string().max(10000).nullable().optional(),
    finalEstimateLow: money().optional(),
    finalEstimateHigh: money().optional(),
    finalReserve: money().optional(),
    finalCategory: z.string().max(200).optional(),
  })).min(1, 'At least one item is required').max(200),
});

type ItemStatus = (typeof uploadItems.$inferSelect)['status'];

// Which current statuses each action may be applied to. Accept needs the AI
// pass to have run (or a prior accept being re-saved with overrides); a
// decline can short-circuit an item that never needs cataloging. Nothing
// touches an item that has already become a lot.
const ALLOWED_FROM: Record<'accept' | 'decline' | 'reset', ItemStatus[]> = {
  accept: ['cataloged', 'accepted'],
  decline: ['uploaded', 'cataloged', 'accepted', 'declined'],
  reset: ['accepted', 'declined'],
};

const NEXT_STATUS = {
  accept: 'accepted',
  decline: 'declined',
  reset: 'cataloged',
} as const;

/** Thrown inside the transaction to roll back and surface a 409. */
class ItemChangedError extends Error {}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const items = await db
      .select()
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId))
      .orderBy(asc(uploadItems.sortOrder), asc(uploadItems.createdAt));

    return NextResponse.json({ items });
  } catch (error) {
    logger.error('GET prospect items error', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

export async function PATCH(
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
    const parsed = itemReviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { items } = parsed.data;

    // Validate every transition before writing any of them so a bad item in
    // a bulk request doesn't half-apply.
    const current = await db
      .select({ id: uploadItems.id, status: uploadItems.status, title: uploadItems.aiTitle, sellerTitle: uploadItems.sellerTitle })
      .from(uploadItems)
      .where(and(eq(uploadItems.prospectId, prospectId), inArray(uploadItems.id, items.map((i) => i.id))));
    const byId = new Map(current.map((c) => [c.id, c]));

    for (const item of items) {
      const row = byId.get(item.id);
      if (!row) {
        return NextResponse.json({ error: 'Item not found on this prospect' }, { status: 404 });
      }
      if (!ALLOWED_FROM[item.action].includes(row.status)) {
        const label = row.title || row.sellerTitle || 'This item';
        const why =
          item.action === 'accept' && row.status === 'uploaded'
            ? `${label} hasn't been cataloged yet — run AI processing before accepting it.`
            : row.status === 'lot_created'
              ? `${label} is already a lot and can't be changed here.`
              : `${label} is ${row.status.replace(/_/g, ' ')} and can't be ${item.action === 'reset' ? 'reset' : `${item.action}ed`}.`;
        return NextResponse.json({ error: why, itemId: item.id }, { status: 409 });
      }
    }

    // Each write repeats its status check, all in one transaction: the read
    // above can be stale by now (Create lots, an AI run, or a second admin
    // may have moved the item on), and writing past them would, say, turn a
    // lot_created item back into an accepted one that becomes a second lot.
    try {
      await db.transaction(async (tx) => {
        for (const item of items) {
          const [updated] = await tx
            .update(uploadItems)
            .set({
              status: NEXT_STATUS[item.action],
              reviewedAt: item.action === 'reset' ? null : new Date(),
              updatedAt: new Date(),
              ...(item.adminNotes !== undefined && { adminNotes: item.adminNotes }),
              ...(item.finalTitle !== undefined && { finalTitle: item.finalTitle }),
              ...(item.finalDescription !== undefined && { finalDescription: item.finalDescription }),
              ...(item.finalEstimateLow !== undefined && { finalEstimateLow: item.finalEstimateLow }),
              ...(item.finalEstimateHigh !== undefined && { finalEstimateHigh: item.finalEstimateHigh }),
              ...(item.finalReserve !== undefined && { finalReserve: item.finalReserve }),
              ...(item.finalCategory !== undefined && { finalCategory: item.finalCategory }),
            })
            .where(
              and(
                eq(uploadItems.id, item.id),
                eq(uploadItems.prospectId, prospectId),
                inArray(uploadItems.status, ALLOWED_FROM[item.action]),
              ),
            )
            .returning({ id: uploadItems.id });
          if (!updated) throw new ItemChangedError();
        }
      });
    } catch (err) {
      if (err instanceof ItemChangedError) {
        return NextResponse.json(
          { error: 'Some of these items changed at the same time (an AI run, Create lots, or another admin). Nothing was saved. Refresh and try again.' },
          { status: 409 },
        );
      }
      throw err;
    }

    // Recount accepted and reviewed items for the prospect.
    // Totals fall back to the AI estimate when no admin override was entered
    // (a plain Accept sends no final* values), and count every non-declined
    // item so the agreement email never reports "$0 – $0".
    const [counts] = await db
      .select(reviewCountsSelect())
      .from(uploadItems)
      .where(eq(uploadItems.prospectId, prospectId));

    await db
      .update(sellerProspects)
      .set({
        reviewedItems: counts.reviewedItems,
        acceptedItems: counts.acceptedItems,
        totalEstimateLow: counts.totalEstimateLow,
        totalEstimateHigh: counts.totalEstimateHigh,
        updatedAt: new Date(),
      })
      .where(eq(sellerProspects.id, prospectId));

    return NextResponse.json({
      reviewedItems: counts.reviewedItems,
      acceptedItems: counts.acceptedItems,
      totalEstimateLow: counts.totalEstimateLow,
      totalEstimateHigh: counts.totalEstimateHigh,
    });
  } catch (error) {
    logger.error('PATCH prospect items error', error);
    return NextResponse.json({ error: 'Failed to update items' }, { status: 500 });
  }
}
