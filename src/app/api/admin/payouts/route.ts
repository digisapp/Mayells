import { NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { payouts, users, lots, invoices } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const items = await db
      .select({
        payout: payouts,
        seller: { id: users.id, fullName: users.fullName, email: users.email },
        lot: { id: lots.id, title: lots.title },
        invoice: { id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status },
      })
      .from(payouts)
      .innerJoin(users, eq(payouts.sellerId, users.id))
      .innerJoin(lots, eq(payouts.lotId, lots.id))
      .innerJoin(invoices, eq(payouts.invoiceId, invoices.id))
      .orderBy(desc(payouts.createdAt));

    return NextResponse.json({ data: items });
  } catch (error) {
    logger.error('Admin payouts error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
