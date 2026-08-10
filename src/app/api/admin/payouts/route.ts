import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { payouts, payoutStatusEnum, users, lots, invoices } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 50;

// GET /api/admin/payouts?page=1&status=pending|paid|cancelled
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;
    const statusParam = req.nextUrl.searchParams.get('status');
    const status = payoutStatusEnum.enumValues.find((s) => s === statusParam);
    const whereClause = status ? eq(payouts.status, status) : undefined;

    const [items, countResult, statusRows] = await Promise.all([
      db
        .select({
          payout: {
            id: payouts.id,
            status: payouts.status,
            hammerPrice: payouts.hammerPrice,
            commissionPercent: payouts.commissionPercent,
            commissionAmount: payouts.commissionAmount,
            netAmount: payouts.netAmount,
            method: payouts.method,
            reference: payouts.reference,
            paidAt: payouts.paidAt,
            createdAt: payouts.createdAt,
          },
          seller: { id: users.id, fullName: users.fullName, email: users.email },
          lot: { id: lots.id, title: lots.title },
          invoice: { id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status },
        })
        .from(payouts)
        .innerJoin(users, eq(payouts.sellerId, users.id))
        .innerJoin(lots, eq(payouts.lotId, lots.id))
        .innerJoin(invoices, eq(payouts.invoiceId, invoices.id))
        .where(whereClause)
        .orderBy(desc(payouts.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(payouts).where(whereClause),
      // Global (not page- or filter-scoped) numbers for the header summary
      db
        .select({
          status: payouts.status,
          count: sql<number>`count(*)::int`,
          netTotal: sql<number>`coalesce(sum(${payouts.netAmount}), 0)::int`,
        })
        .from(payouts)
        .groupBy(payouts.status),
    ]);

    const total = countResult[0]?.count ?? 0;
    const stats = {
      pending: statusRows.find((r) => r.status === 'pending')?.count ?? 0,
      pendingNet: statusRows.find((r) => r.status === 'pending')?.netTotal ?? 0,
      paid: statusRows.find((r) => r.status === 'paid')?.count ?? 0,
    };

    return NextResponse.json({
      data: items,
      stats,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Admin payouts error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
