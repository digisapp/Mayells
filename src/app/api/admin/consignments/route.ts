import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { consignments, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
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

    const items = await db
      .select({
        consignment: consignments,
        seller: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(consignments)
      .innerJoin(users, eq(consignments.sellerId, users.id))
      .orderBy(desc(consignments.createdAt));

    return NextResponse.json({ data: items });
  } catch (error) {
    logger.error('Admin consignments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const { id, status, reviewNotes, commissionPercent } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }

    const [updated] = await db
      .update(consignments)
      .set({
        status: status as 'submitted' | 'under_review' | 'approved' | 'declined' | 'listed' | 'sold' | 'returned',
        reviewNotes,
        commissionPercent,
        reviewedById: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(consignments.id, id))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin consignment review error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
