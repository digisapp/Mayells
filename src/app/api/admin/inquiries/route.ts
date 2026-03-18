import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { inquiries, lots, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allInquiries = await db
      .select({
        inquiry: inquiries,
        lot: {
          id: lots.id,
          title: lots.title,
          primaryImageUrl: lots.primaryImageUrl,
        },
      })
      .from(inquiries)
      .innerJoin(lots, eq(inquiries.lotId, lots.id))
      .orderBy(desc(inquiries.createdAt))
      .limit(200);

    return NextResponse.json({ data: allInquiries });
  } catch (error) {
    logger.error('Admin inquiries fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, status, adminNotes } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Inquiry ID required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

    await db.update(inquiries).set(updateData).where(eq(inquiries.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin inquiry update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
