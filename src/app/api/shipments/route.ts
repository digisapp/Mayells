import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { shipments } from '@/db/schema';
import { eq, desc, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/shipments — returns shipments for the authenticated user (as seller or buyer).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const items = await db
      .select()
      .from(shipments)
      .where(or(
        eq(shipments.sellerId, user.id),
        eq(shipments.buyerId, user.id),
      ))
      .orderBy(desc(shipments.createdAt));

    // Format for display
    const formatted = items.map(s => ({
      ...s,
      shippingCost: s.shippingCost / 100,
      insuranceCost: s.insuranceCost / 100,
      insuranceValue: s.insuranceValue ? s.insuranceValue / 100 : null,
      role: s.sellerId === user.id ? 'seller' : 'buyer',
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    logger.error('Shipments list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
