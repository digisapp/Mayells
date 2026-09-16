import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { estateVisits, estateVisitItems } from '@/db/schema';
import { eq, and, ne, or, isNull, lt, sql } from 'drizzle-orm';
import { sendAppraisalReportEmail } from '@/lib/email/notifications';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';

// A resend within this window is treated as a double-tap, not a request.
const RESEND_COOLDOWN_MS = 30_000;

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

    if (!visit.clientEmail) {
      return NextResponse.json({ error: 'Client email is required to send report' }, { status: 400 });
    }
    if (visit.status === 'processing' || visit.status === 'uploading') {
      return NextResponse.json({ error: 'Finish the AI analysis before sending the report' }, { status: 409 });
    }

    const isResend = visit.status === 'sent';
    const reportUrl = `${BUSINESS.url}/appraisal-report/${visit.reportToken}`;

    // Claim the send atomically. A first send flips the status; a resend is
    // allowed (updating sentAt) unless the last send was moments ago, so a
    // double-click or concurrent request can't email the client twice.
    const cooldownCutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
    const claimed = await db
      .update(estateVisits)
      .set({ status: 'sent', sentAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(estateVisits.id, visitId),
          or(ne(estateVisits.status, 'sent'), isNull(estateVisits.sentAt), lt(estateVisits.sentAt, cooldownCutoff)),
        ),
      )
      .returning({ id: estateVisits.id });

    if (claimed.length === 0) {
      return NextResponse.json({ error: 'Report was just sent — wait a moment before resending.' }, { status: 409 });
    }

    // The report only lists completed items; say so in the email.
    const [{ completed }] = await db
      .select({ completed: sql<number>`count(*)::int` })
      .from(estateVisitItems)
      .where(and(eq(estateVisitItems.visitId, visitId), eq(estateVisitItems.status, 'completed')));

    try {
      await sendAppraisalReportEmail({
        clientName: visit.clientName,
        clientEmail: visit.clientEmail,
        reportUrl,
        itemCount: completed,
        totalEstimateLow: visit.totalEstimateLow,
        totalEstimateHigh: visit.totalEstimateHigh,
      });
    } catch (sendErr) {
      // Roll the claim back so the admin can retry after a send failure.
      await db
        .update(estateVisits)
        .set({ status: visit.status, sentAt: visit.sentAt, updatedAt: sql`now()` })
        .where(eq(estateVisits.id, visitId));
      throw sendErr;
    }

    return NextResponse.json({ success: true, reportUrl, resent: isResend });
  } catch (error) {
    logger.error('Send report error', error);
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 });
  }
}
