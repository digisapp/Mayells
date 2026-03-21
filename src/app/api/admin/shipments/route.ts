import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { shipments, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
