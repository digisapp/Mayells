import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctionReminders, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { lotId } = await req.json();
    if (!lotId) {
      return NextResponse.json({ error: 'lotId is required' }, { status: 400 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const email = profile?.email || user.email || '';

    await db
      .insert(auctionReminders)
      .values({ userId: user.id, lotId, email })
      .onConflictDoNothing();

    return NextResponse.json({ data: { message: 'Reminder set' } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { lotId } = await req.json();
    if (!lotId) {
      return NextResponse.json({ error: 'lotId is required' }, { status: 400 });
    }

    await db
      .delete(auctionReminders)
      .where(and(eq(auctionReminders.userId, user.id), eq(auctionReminders.lotId, lotId)));

    return NextResponse.json({ data: { message: 'Reminder removed' } });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
