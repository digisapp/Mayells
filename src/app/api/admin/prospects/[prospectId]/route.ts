import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { calls, sellerProspects, uploadItems } from '@/db/schema';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getDefaultCommissionPercent } from '@/lib/settings/commission';
import { UUID_RE } from '@/lib/bidding/lot-resolution';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const prospect = await db.query.sellerProspects.findFirst({
      where: eq(sellerProspects.id, prospectId),
      with: {
        uploadLinks: {
          with: {
            items: true,
          },
        },
      },
    });

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // The commission the agreement should propose when this consignor has no
    // agreed rate yet — same source settlement uses, so the two can't drift.
    const [defaultCommissionPercent, prospectCalls] = await Promise.all([
      getDefaultCommissionPercent(),
      db.select().from(calls).where(eq(calls.prospectId, prospectId)).orderBy(desc(calls.startedAt)).limit(20),
    ]);
    return NextResponse.json({ data: prospect, defaultCommissionPercent, calls: prospectCalls });
  } catch (error) {
    logger.error('Admin prospect detail error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Once any item has become a lot the prospect is part of the sale record
    // (seller-of-record, consignor portal, payouts). Archive it instead.
    const [{ lotCount }] = await db
      .select({ lotCount: sql<number>`count(*)::int` })
      .from(uploadItems)
      .where(and(eq(uploadItems.prospectId, prospectId), isNotNull(uploadItems.lotId)));
    if (lotCount > 0) {
      return NextResponse.json(
        { error: `This prospect has ${lotCount} lot${lotCount === 1 ? '' : 's'} in the catalog and can't be deleted. Archive it instead.` },
        { status: 409 },
      );
    }

    const deleted = await db
      .delete(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .returning({ id: sellerProspects.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin prospect delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
