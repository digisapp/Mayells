import { NextRequest, NextResponse } from 'next/server';
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
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

const PAGE_SIZE = 50;

// GET /api/admin/users?search=...&page=1
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
      db.select().from(users).where(whereClause).orderBy(desc(users.createdAt)).limit(PAGE_SIZE).offset(offset),
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
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin user update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
