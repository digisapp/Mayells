import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendAppraisalReportEmail } from '@/lib/email/notifications';
import { BUSINESS } from '@/lib/config';

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

    await sendAppraisalReportEmail({
      clientName: visit.clientName,
      clientEmail: visit.clientEmail,
      reportUrl,
      itemCount: visit.itemCount,
      totalEstimateLow: visit.totalEstimateLow,
      totalEstimateHigh: visit.totalEstimateHigh,
    });

    await db
      .update(estateVisits)
      .set({
        status: 'sent',
        sentAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(estateVisits.id, visitId));

    return NextResponse.json({ success: true, reportUrl });
  } catch (error) {
    console.error('Send report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
