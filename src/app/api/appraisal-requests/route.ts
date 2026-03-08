import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const appraisalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  items: z.string().optional(),
  email: z.string().email().optional(),
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

    // TODO: Store in DB and/or send notification email
    // For now, log and return success
    console.log('Appraisal/service request:', parsed.data);

    return NextResponse.json(
      { data: { message: 'Request submitted successfully' } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
