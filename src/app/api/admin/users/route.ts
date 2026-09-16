import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users, lots, consignments, bids } from '@/db/schema';
import { desc, or, ilike, sql, exists, eq, and, inArray } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { containsPattern } from '@/lib/db/like';
import { SHADOW_EMAIL_DOMAIN } from '@/lib/sellers/shadow';
import { logger } from '@/lib/logger';
import { applyUserUpdate, userProjection } from './guards';

const USER_FILTERS = ['all', 'consignors', 'bidders', 'admins', 'suspended', 'shadow'] as const;

const userPatchSchema = z.object({
  id: z.string().uuid('Valid user ID required'),
  role: z.enum(['buyer', 'seller', 'admin', 'auctioneer']).optional(),
  accountStatus: z.enum(['active', 'suspended', 'banned']).optional(),
  isAdmin: z.boolean().optional(),
});

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  filter: z.enum(USER_FILTERS).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const PAGE_SIZE = 50;

// Correlated subqueries: cheap per row at admin-page volumes and they keep the
// list a single round trip.
const activityColumns = {
  lotCount: sql<number>`(select count(*) from ${lots} l where l.seller_id = ${users.id})::int`,
  soldCount: sql<number>`(select count(*) from ${lots} l where l.seller_id = ${users.id} and l.status = 'sold')::int`,
  consignmentCount: sql<number>`(select count(*) from ${consignments} c where c.seller_id = ${users.id})::int`,
  bidCount: sql<number>`(select count(*) from ${bids} b where b.bidder_id = ${users.id})::int`,
  // bigint comes back from pg as a string — normalised below
  salesTotalCents: sql<string>`coalesce((select sum(l.hammer_price) from ${lots} l where l.seller_id = ${users.id} and l.status = 'sold'), 0)::bigint`,
};

// GET /api/admin/users?search=...&filter=consignors|bidders|admins|suspended|shadow&page=1
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      search: sp.get('search')?.trim() || undefined,
      filter: sp.get('filter') || undefined,
      page: sp.get('page') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { search, filter, page } = parsed.data;
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    if (search) {
      const pattern = containsPattern(search);
      conditions.push(
        or(
          ilike(users.email, pattern),
          ilike(users.fullName, pattern),
          ilike(users.displayName, pattern),
          ilike(users.companyName, pattern),
          ilike(users.paddleNumber, pattern),
        )!,
      );
    }
    switch (filter) {
      case 'consignors':
        conditions.push(
          or(
            exists(db.select({ one: sql`1` }).from(lots).where(eq(lots.sellerId, users.id))),
            exists(db.select({ one: sql`1` }).from(consignments).where(eq(consignments.sellerId, users.id))),
          )!,
        );
        break;
      case 'bidders':
        conditions.push(exists(db.select({ one: sql`1` }).from(bids).where(eq(bids.bidderId, users.id))));
        break;
      case 'admins':
        conditions.push(or(eq(users.role, 'admin'), eq(users.isAdmin, true))!);
        break;
      case 'suspended':
        conditions.push(inArray(users.accountStatus, ['suspended', 'banned']));
        break;
      case 'shadow':
        conditions.push(ilike(users.email, `%@${SHADOW_EMAIL_DOMAIN}`));
        break;
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({ ...userProjection, ...activityColumns })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json({
      data: rows.map((r) => ({ ...r, salesTotalCents: Number(r.salesTotalCents) })),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Admin users fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/users — update role, account status, or admin flag
export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = userPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;
    const result = await applyUserUpdate(admin.id, id, updates);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const u = result.data;
    return NextResponse.json({
      data: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        displayName: u.displayName,
        role: u.role,
        isAdmin: u.isAdmin,
        accountStatus: u.accountStatus,
        cardVerifiedAt: u.cardVerifiedAt,
        identityVerifiedAt: u.identityVerifiedAt,
        paddleNumber: u.paddleNumber,
        phone: u.phone,
        companyName: u.companyName,
        createdAt: u.createdAt,
      },
    });
  } catch (error) {
    logger.error('Admin user update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
