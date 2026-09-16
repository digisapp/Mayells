import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { markPayoutsPaid } from '@/lib/payouts/mark-paid';
import { logger } from '@/lib/logger';

const bulkSchema = z.object({
  payoutIds: z.array(z.string().uuid()).min(1).max(200),
  method: z.enum(['wire', 'check', 'other']),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  paidAt: z
    .string()
    .trim()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Valid date required')
    .optional(),
});

/**
 * POST /api/admin/payouts/bulk-mark-paid — one wire/check covering several
 * payouts to the same consignor (or any set of payouts). Each payout is still
 * guarded individually; the response lists what was skipped and why.
 */
export async function POST(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await markPayoutsPaid({
      payoutIds: parsed.data.payoutIds,
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : null,
      adminId: admin.id,
    });

    if (result.paid.length === 0) {
      return NextResponse.json(
        {
          error: result.skipped[0]?.reason ?? 'No payouts could be marked paid',
          skipped: result.skipped,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      data: {
        paid: result.paid.length,
        paidIds: result.paid.map((p) => p.id),
        totalNet: result.paid.reduce((sum, p) => sum + p.netAmount, 0),
        skipped: result.skipped,
        emailsSent: result.emailsSent,
      },
    });
  } catch (error) {
    logger.error('Admin bulk mark-paid error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
