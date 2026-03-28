import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { invoices, users, lots } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// GET /api/admin/invoices
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const allInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        hammerPrice: invoices.hammerPrice,
        buyerPremium: invoices.buyerPremium,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        buyerName: users.fullName,
        buyerEmail: users.email,
        lotTitle: lots.title,
      })
      .from(invoices)
      .innerJoin(users, eq(invoices.buyerId, users.id))
      .innerJoin(lots, eq(invoices.lotId, lots.id))
      .orderBy(desc(invoices.createdAt))
      .limit(200);

    return NextResponse.json({ data: allInvoices });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/admin/invoices — update invoice status
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, status } = body;

    if (!id) return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });

    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled', 'refunded'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (status) {
      updates.status = status;
      if (status === 'paid') {
        updates.paidAt = sql`now()`;
      }
    }

    const [updated] = await db
      .update(invoices)
      .set(updates)
      .where(eq(invoices.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
