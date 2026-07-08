import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, users } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { sendAppraisalReportEmail } from '@/lib/email/notifications';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

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

    if (!visit.clientEmail) {
      return NextResponse.json({ error: 'Client email is required to send report' }, { status: 400 });
    }

    const reportUrl = `${BUSINESS.url}/appraisal-report/${visit.reportToken}`;

    // Atomically claim the send: flip to 'sent' only if it isn't already, so a
    // double-click (or concurrent request) can't email the client twice.
    const claimed = await db
      .update(estateVisits)
      .set({ status: 'sent', sentAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(estateVisits.id, visitId), ne(estateVisits.status, 'sent')))
      .returning({ id: estateVisits.id });

    if (claimed.length === 0) {
      return NextResponse.json({ error: 'Report has already been sent' }, { status: 409 });
    }

    try {
      await sendAppraisalReportEmail({
        clientName: visit.clientName,
        clientEmail: visit.clientEmail,
        reportUrl,
        itemCount: visit.itemCount,
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

    return NextResponse.json({ success: true, reportUrl });
  } catch (error) {
    logger.error('Send report error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
