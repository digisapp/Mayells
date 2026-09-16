import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { markPayoutsPaid } from '@/lib/payouts/mark-paid';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Manual methods only — there is no Stripe Connect transfer flow.
const markPaidSchema = z.object({
  method: z.enum(['wire', 'check', 'other']),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  paidAt: z
    .string()
    .trim()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Valid date required')
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ payoutId: string }> }
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { payoutId } = await params;
    if (!UUID_RE.test(payoutId)) return NextResponse.json({ error: 'Payout not found' }, { status: 404 });

    const parsed = markPaidSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await markPayoutsPaid({
      payoutIds: [payoutId],
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : null,
      adminId: admin.id,
    });

    if (result.paid.length === 0) {
      const skipped = result.skipped[0];
      const notFound = skipped?.reason === 'Payout not found';
      return NextResponse.json(
        { error: skipped?.reason ?? 'Payout could not be marked paid' },
        { status: notFound ? 404 : 409 },
      );
    }

    return NextResponse.json({ data: result.paid[0], emailsSent: result.emailsSent });
  } catch (error) {
    logger.error('Admin mark-paid payout error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
