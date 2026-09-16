import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sellerProspects, uploadItems } from '@/db/schema';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import {
  sendAgreementSignedAdminNotification,
  sendAgreementSignedConfirmation,
} from '@/lib/email/notifications';

// Public, unauthenticated endpoint. The prospect UUID acts as the capability
// token: it is only ever delivered in the agreement email sent by
// /api/admin/prospects/[prospectId]/agreement, and UUIDs are not guessable.
// Signing is additionally gated on an agreement actually having been sent.

const signSchema = z.object({
  prospectId: z.string().uuid('Valid agreement reference required'),
  signedName: z
    .string()
    .trim()
    .min(2, 'Please type your full legal name')
    .max(200),
  agree: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { success: allowed } = await rateLimit(`agreement-sign:${ip}`, {
      maxRequests: 10,
      windowSeconds: 3600,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const parsed = signSchema.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message =
        issue.path[0] === 'agree'
          ? 'You must agree to the consignment terms to sign'
          : issue.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { prospectId, signedName } = parsed.data;

    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }
    if (prospect.agreementSignedAt) {
      return NextResponse.json(
        { error: 'This agreement has already been signed' },
        { status: 409 },
      );
    }
    if (!prospect.agreementSentAt) {
      return NextResponse.json(
        { error: 'This agreement is not yet ready for signature' },
        { status: 400 },
      );
    }

    const signedAt = new Date();
    // No dedicated signed-name column on seller_prospects — record the typed
    // name in the notes audit trail rather than adding a column.
    const signatureNote = `[${signedAt.toISOString()}] Consignment agreement signed electronically by "${signedName}" (IP: ${ip})`;

    // Guard the update on agreement_signed_at still being NULL so two
    // concurrent submissions can't both win.
    const [updated] = await db
      .update(sellerProspects)
      .set({
        agreementSignedAt: signedAt,
        agreementIp: ip,
        status: 'agreement_signed',
        notes: prospect.notes ? `${prospect.notes}\n${signatureNote}` : signatureNote,
        updatedAt: signedAt,
      })
      .where(
        and(
          eq(sellerProspects.id, prospectId),
          isNull(sellerProspects.agreementSignedAt),
        ),
      )
      .returning({ id: sellerProspects.id });

    if (!updated) {
      return NextResponse.json(
        { error: 'This agreement has already been signed' },
        { status: 409 },
      );
    }

    logger.info('Consignment agreement signed', { prospectId, ip });

    // Notifications are best-effort: the signature is already recorded, and
    // an email outage must not tell the consignor their signing failed.
    try {
      const [totals] = await db
        .select({
          acceptedCount: sql<number>`count(*)::int`,
          totalEstimateLow: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateLow}, ${uploadItems.aiEstimateLow})), 0)::int`,
          totalEstimateHigh: sql<number>`coalesce(sum(coalesce(${uploadItems.finalEstimateHigh}, ${uploadItems.aiEstimateHigh})), 0)::int`,
        })
        .from(uploadItems)
        .where(and(eq(uploadItems.prospectId, prospectId), inArray(uploadItems.status, ['accepted', 'lot_created'])));

      const commissionPercent = prospect.agreedCommissionPercent ?? 35;
      const summary = {
        commissionPercent,
        acceptedCount: totals?.acceptedCount ?? 0,
        totalEstimateLow: totals?.totalEstimateLow ?? 0,
        totalEstimateHigh: totals?.totalEstimateHigh ?? 0,
      };

      await sendAgreementSignedAdminNotification({
        prospectId,
        prospectName: prospect.fullName,
        prospectEmail: prospect.email && !isSentinelEmail(prospect.email) ? prospect.email : null,
        signedName,
        ...summary,
      });

      if (prospect.email && !isSentinelEmail(prospect.email)) {
        await sendAgreementSignedConfirmation({
          prospectEmail: prospect.email,
          prospectName: prospect.fullName,
          signedName,
          signedAt,
          agreementUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/consignment-agreement?prospect=${prospectId}`,
          ...summary,
        });
      }
    } catch (emailError) {
      logger.error('Agreement signed notification failed', emailError, { prospectId });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Agreement sign error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
