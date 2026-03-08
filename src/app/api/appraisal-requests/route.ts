import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';

const appraisalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  items: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  service: z.string().optional(),
  message: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = appraisalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Send notification email to admin (fire and forget)
    sendAppraisalRequestNotification(parsed.data).catch((err) =>
      console.error('Failed to send appraisal notification:', err),
    );

    return NextResponse.json(
      { data: { message: 'Request submitted successfully' } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
