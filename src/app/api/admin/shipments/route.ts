import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { shipments, users, shipmentStatusEnum, carrierEnum } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const shipmentPatchSchema = z.object({
  id: z.string().uuid('Valid shipment ID required'),
  status: z.enum(shipmentStatusEnum.enumValues).optional(),
  carrier: z.enum(carrierEnum.enumValues).optional(),
  trackingNumber: z.string().max(255).optional(),
  trackingUrl: z.string().url('Valid tracking URL required').max(2048).or(z.literal('')).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const items = await db
      .select({
        shipment: shipments,
        seller: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(shipments)
      .innerJoin(users, eq(shipments.sellerId, users.id))
      .orderBy(desc(shipments.createdAt));

    return NextResponse.json({ data: items });
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
