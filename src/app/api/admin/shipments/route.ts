import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { shipments, users, shipmentStatusEnum, carrierEnum } from '@/db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const shipmentPatchSchema = z.object({
  id: z.string().uuid('Valid shipment ID required'),
  status: z.enum(shipmentStatusEnum.enumValues).optional(),
  carrier: z.enum(carrierEnum.enumValues).optional(),
  trackingNumber: z.string().max(255).optional(),
  trackingUrl: z.string().url('Valid tracking URL required').max(2048).or(z.literal('')).optional(),
});

const PAGE_SIZE = 50;

// Header summary buckets — also the valid values for the ?status= filter
const STATUS_GROUPS = {
  pending: ['pending', 'label_created'],
  in_transit: ['pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery'],
  completed: ['delivered', 'returned', 'exception'],
} as const;

// GET /api/admin/shipments?page=1&status=pending|in_transit|completed
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
    const group = statusParam && statusParam in STATUS_GROUPS
      ? STATUS_GROUPS[statusParam as keyof typeof STATUS_GROUPS]
      : undefined;
    const whereClause = group ? inArray(shipments.status, [...group]) : undefined;

    const [items, countResult, statusRows] = await Promise.all([
      db
        .select({
          shipment: {
            id: shipments.id,
            status: shipments.status,
            method: shipments.method,
            carrier: shipments.carrier,
            trackingNumber: shipments.trackingNumber,
            trackingUrl: shipments.trackingUrl,
            fromCity: shipments.fromCity,
            fromState: shipments.fromState,
            toCity: shipments.toCity,
            toState: shipments.toState,
            toName: shipments.toName,
            createdAt: shipments.createdAt,
          },
          seller: { id: users.id, fullName: users.fullName, email: users.email },
        })
        .from(shipments)
        .innerJoin(users, eq(shipments.sellerId, users.id))
        .where(whereClause)
        .orderBy(desc(shipments.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(whereClause),
      // Global (not page- or filter-scoped) numbers for the header summary
      db
        .select({ status: shipments.status, count: sql<number>`count(*)::int` })
        .from(shipments)
        .groupBy(shipments.status),
    ]);

    const total = countResult[0]?.count ?? 0;
    const countIn = (statuses: readonly string[]) =>
      statusRows.reduce((sum, r) => (statuses.includes(r.status) ? sum + r.count : sum), 0);
    const stats = {
      pending: countIn(STATUS_GROUPS.pending),
      inTransit: countIn(STATUS_GROUPS.in_transit),
      completed: countIn(STATUS_GROUPS.completed),
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
    logger.error('Admin shipments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/shipments — manually update status, carrier, and tracking
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const parsed = shipmentPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, status, carrier, trackingNumber, trackingUrl } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      if (status === 'delivered') updates.deliveredAt = new Date();
    }
    if (carrier !== undefined) updates.carrier = carrier;
    if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber.trim() || null;
    if (trackingUrl !== undefined) updates.trackingUrl = trackingUrl.trim() || null;

    const [updated] = await db
      .update(shipments)
      .set(updates)
      .where(eq(shipments.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin shipment update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
