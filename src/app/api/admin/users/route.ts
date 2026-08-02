import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, desc, or, ilike, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const userPatchSchema = z.object({
  id: z.string().uuid('Valid user ID required'),
  role: z.enum(['buyer', 'seller', 'admin', 'auctioneer']).optional(),
  accountStatus: z.enum(['active', 'suspended', 'banned']).optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { admin: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || !isAdminProfile(profile)) {
    return { admin: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { admin: profile, response: null };
}

const PAGE_SIZE = 50;

// Only what the admin users page renders — never expose portalToken or Stripe IDs.
const userListColumns = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  displayName: users.displayName,
  role: users.role,
  accountStatus: users.accountStatus,
  cardVerifiedAt: users.cardVerifiedAt,
  identityVerifiedAt: users.identityVerifiedAt,
  paddleNumber: users.paddleNumber,
  createdAt: users.createdAt,
};

// GET /api/admin/users?search=...&page=1
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdmin();
    if (!admin) return response;

    const search = req.nextUrl.searchParams.get('search')?.trim();
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(users.email, pattern),
          ilike(users.fullName, pattern),
          ilike(users.displayName, pattern),
        )!,
      );
    }

    const whereClause = conditions.length ? conditions[0] : undefined;

    const [data, countResult] = await Promise.all([
      db.select(userListColumns).from(users).where(whereClause).orderBy(desc(users.createdAt)).limit(PAGE_SIZE).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(whereClause),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: countResult[0]?.count ?? 0,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Admin users fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/users — update role or account status
export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdmin();
    if (!admin) return response;

    const parsed = userPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, role, accountStatus } = parsed.data;

    // Prevent admin from changing their own role
    if (id === admin.id && role && role !== admin.role) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (role) updateData.role = role;
    if (accountStatus) updateData.accountStatus = accountStatus;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    updateData.updatedAt = new Date();

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning(userListColumns);
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin user update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
