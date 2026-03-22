import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, auctions, users, outreachContacts, consignments, estateVisits } from '@/db/schema';
import { sql, desc, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [
      [lotCount],
      [auctionCount],
      [userCount],
      [activeLots],
      [activeAuctions],
      [outreachCount],
      [outreachFollowUp],
      [appraisalCount],
      [appraisalReview],
      recentConsignments,
      recentAppraisals,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(lots),
      db.select({ count: sql<number>`count(*)` }).from(auctions),
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*) filter (where ${lots.status} in ('for_sale', 'in_auction'))` }).from(lots),
      db.select({ count: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))` }).from(auctions),
      db.select({ count: sql<number>`count(*)` }).from(outreachContacts),
      db.select({ count: sql<number>`count(*) filter (where ${outreachContacts.status} in ('new', 'follow_up'))` }).from(outreachContacts),
      db.select({ count: sql<number>`count(*)` }).from(estateVisits),
      db.select({ count: sql<number>`count(*) filter (where ${estateVisits.status} = 'review')` }).from(estateVisits),
      db.select({
        id: consignments.id,
        title: consignments.title,
        status: consignments.status,
        createdAt: consignments.createdAt,
      }).from(consignments).orderBy(desc(consignments.createdAt)).limit(5),
      db.select({
        id: estateVisits.id,
        clientName: estateVisits.clientName,
        itemCount: estateVisits.itemCount,
        status: estateVisits.status,
        createdAt: estateVisits.createdAt,
      }).from(estateVisits).orderBy(desc(estateVisits.createdAt)).limit(5),
    ]);

    return NextResponse.json({
      stats: [
        { label: 'Total Lots', value: Number(lotCount.count) },
        { label: 'Active Lots', value: Number(activeLots.count) },
        { label: 'Total Auctions', value: Number(auctionCount.count) },
        { label: 'Active Auctions', value: Number(activeAuctions.count) },
        { label: 'Users', value: Number(userCount.count) },
        { label: 'Appraisals', value: Number(appraisalCount.count) },
        { label: 'Outreach Leads', value: Number(outreachCount.count) },
      ],
      recentConsignments,
      recentAppraisals,
      appraisalReviewCount: Number(appraisalReview.count),
      outreachFollowUpCount: Number(outreachFollowUp.count),
    });
  } catch (error) {
    logger.error('Dashboard data fetch error', error);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}
