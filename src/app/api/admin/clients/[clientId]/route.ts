import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, consignments, lots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { clientId } = await params;

    const [client] = await db.select().from(users).where(eq(users.id, clientId)).limit(1);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const clientConsignments = await db
      .select()
      .from(consignments)
      .where(eq(consignments.sellerId, clientId))
      .orderBy(desc(consignments.createdAt));

    const clientLots = await db
      .select()
      .from(lots)
      .where(eq(lots.sellerId, clientId))
      .orderBy(desc(lots.createdAt));

    return NextResponse.json({
      data: {
        client: {
          id: client.id,
          fullName: client.fullName,
          email: client.email,
          companyName: client.companyName,
          phone: client.phone,
          bio: client.bio,
          createdAt: client.createdAt,
        },
        consignments: clientConsignments,
        lots: clientLots,
      },
    });
  } catch (error) {
    logger.error('Admin client detail error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
