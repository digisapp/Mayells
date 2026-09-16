import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { payouts, users, invoices, auctions } from '@/db/schema';
import { eq, sql, asc } from 'drizzle-orm';
import {
  parsePayoutFilters,
  payoutWhere,
  payoutListQuery,
  payoutCountQuery,
  payoutListOrder,
} from '@/lib/payouts/admin-query';
import { logger } from '@/lib/logger';

// Larger page so consignor groups rarely straddle a page boundary.
const PAGE_SIZE = 100;

// GET /api/admin/payouts?page=1&status=&sellerId=&auctionId=&q=
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;
    const filters = parsePayoutFilters(sp);
    const where = payoutWhere(filters);

    const [items, countResult, [stats], sellerOptions, auctionOptions] = await Promise.all([
      payoutListQuery().where(where).orderBy(...payoutListOrder).limit(PAGE_SIZE).offset(offset),
      payoutCountQuery().where(where),
      // Global (not page- or filter-scoped) numbers for the header summary
      db
        .select({
          pending: sql<number>`count(*) filter (where ${payouts.status} = 'pending')::int`,
          pendingNet: sql<number>`coalesce(sum(${payouts.netAmount}) filter (where ${payouts.status} = 'pending'), 0)::int`,
          paid: sql<number>`count(*) filter (where ${payouts.status} = 'paid')::int`,
          paidNet: sql<number>`coalesce(sum(${payouts.netAmount}) filter (where ${payouts.status} = 'paid'), 0)::int`,
          reversed: sql<number>`count(*) filter (where ${payouts.status} = 'reversed')::int`,
          reversedNet: sql<number>`coalesce(sum(${payouts.netAmount}) filter (where ${payouts.status} = 'reversed'), 0)::int`,
          // House commission on live settlements (pending or paid out)
          commissionEarned: sql<number>`coalesce(sum(${payouts.commissionAmount}) filter (where ${payouts.status} in ('pending', 'paid')), 0)::int`,
          commissionEarnedThisMonth: sql<number>`coalesce(sum(${payouts.commissionAmount}) filter (where ${payouts.status} in ('pending', 'paid') and ${payouts.createdAt} >= date_trunc('month', now())), 0)::int`,
        })
        .from(payouts),
      db
        .selectDistinct({ id: users.id, fullName: users.fullName, email: users.email })
        .from(payouts)
        .innerJoin(users, eq(payouts.sellerId, users.id))
        .orderBy(asc(users.fullName), asc(users.email)),
      db
        .selectDistinct({ id: auctions.id, title: auctions.title })
        .from(payouts)
        .innerJoin(invoices, eq(payouts.invoiceId, invoices.id))
        .innerJoin(auctions, eq(invoices.auctionId, auctions.id))
        .orderBy(asc(auctions.title)),
    ]);

    // count(*) can come back as a bigint string from the driver — normalise.
    const total = Number(countResult[0]?.count ?? 0);

    return NextResponse.json({
      data: items,
      stats,
      sellers: sellerOptions,
      auctions: auctionOptions,
      filters,
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
