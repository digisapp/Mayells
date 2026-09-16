import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { sellerProspects, uploadItems } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { sendConsignmentAgreementEmail } from '@/lib/email/notifications';

const agreementSchema = z.object({
  commissionPercent: z.number().int().min(0).max(100).optional(),
  message: z.string().max(5000).optional(),
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
    const parsed = agreementSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { commissionPercent, message } = parsed.data;

    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Signed is signed: the terms on file are a contract, re-sending (with a
    // possibly different commission) would only create confusion.
    if (prospect.agreementSignedAt) {
      return NextResponse.json(
        { error: 'This agreement has already been signed and cannot be re-sent.' },
        { status: 409 },
      );
    }

    if (!prospect.email || isSentinelEmail(prospect.email)) {
      return NextResponse.json({ error: 'Prospect has no email address' }, { status: 400 });
    }

    // Totals come from the accepted items themselves (admin override wins
    // over the AI estimate) — never from the cached counters on the prospect,
    // which can lag behind the last review action.
    const [totals] = await db
      .select({
        acceptedCount: sql<number>`count(*)::int`,
        totalEstimateLow: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateLow}, ${uploadItems.aiEstimateLow})), 0)::int`,
        totalEstimateHigh: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateHigh}, ${uploadItems.aiEstimateHigh})), 0)::int`,
      })
      .from(uploadItems)
      // Items that already became lots (lots created ahead of the signature)
      // were accepted too and are covered by this agreement.
      .where(and(eq(uploadItems.prospectId, prospectId), inArray(uploadItems.status, ['accepted', 'lot_created'])));

    if (!totals || totals.acceptedCount <= 0) {
      return NextResponse.json({ error: 'Prospect has no accepted items' }, { status: 400 });
    }

    const commission = commissionPercent ?? prospect.agreedCommissionPercent ?? 35;
    const signUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/consignment-agreement?prospect=${prospectId}`;

    // Mark as sent first so the state is consistent if the email lands;
    // rolled back below if Resend rejects the message.
    const sentAt = new Date();
    await db
      .update(sellerProspects)
      .set({
        agreedCommissionPercent: commission,
        agreementSentAt: sentAt,
        status: 'agreement_sent',
        acceptedItems: totals.acceptedCount,
        totalEstimateLow: totals.totalEstimateLow,
        totalEstimateHigh: totals.totalEstimateHigh,
        updatedAt: sentAt,
      })
      .where(eq(sellerProspects.id, prospectId));

    try {
      await sendConsignmentAgreementEmail({
        prospectEmail: prospect.email,
        prospectName: prospect.fullName,
        acceptedCount: totals.acceptedCount,
        totalEstimateLow: totals.totalEstimateLow,
        totalEstimateHigh: totals.totalEstimateHigh,
        commissionPercent: commission,
        signUrl,
        message,
      });
    } catch (sendError) {
      // Don't leave the prospect marked agreement_sent when the message was
      // rejected — the admin needs to see the failure and retry.
      logger.error('Agreement email send failed', sendError, { prospectId });
      await db
        .update(sellerProspects)
        .set({
          status: prospect.status,
          agreementSentAt: prospect.agreementSentAt,
          agreedCommissionPercent: prospect.agreedCommissionPercent,
          updatedAt: new Date(),
        })
        .where(eq(sellerProspects.id, prospectId));
      return NextResponse.json({ error: 'Failed to send agreement email' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      agreementSentAt: sentAt.toISOString(),
      commissionPercent: commission,
      acceptedCount: totals.acceptedCount,
    });
  } catch (error) {
    logger.error('Send prospect agreement error', error);
    return NextResponse.json({ error: 'Failed to send agreement' }, { status: 500 });
  }
}
