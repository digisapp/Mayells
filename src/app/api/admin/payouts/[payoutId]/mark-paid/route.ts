import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { payouts, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const markPaidSchema = z.object({
  method: z.enum(['wire', 'check', 'stripe', 'other']),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ payoutId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { payoutId } = await params;
    const parsed = markPaidSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Guarded transition: only a pending payout can be marked paid, so a
    // double-click or two admins racing can't record the payment twice.
    const [updated] = await db
      .update(payouts)
      .set({
        status: 'paid',
        method: parsed.data.method,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        paidAt: new Date(),
        paidById: user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, 'pending')))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Payout is not pending (already paid or cancelled)' }, { status: 409 });
    }

    logger.info('Payout marked paid', {
      payoutId,
      method: parsed.data.method,
      netAmount: updated.netAmount,
      by: user.id,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin mark-paid payout error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
