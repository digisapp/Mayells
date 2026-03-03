import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const inquirySchema = z.object({
  lotId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  message: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = inquirySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Verify the lot exists and is a private sale
    const [lot] = await db.select().from(lots).where(eq(lots.id, parsed.data.lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (lot.saleType !== 'private') {
      return NextResponse.json({ error: 'This item is not available for private inquiry' }, { status: 400 });
    }

    // In production, this would:
    // 1. Store the inquiry in an inquiries table
    // 2. Send an email notification to the admin/specialist
    // 3. Send a confirmation email to the inquirer
    // For now, we log it and return success
    const { lotId: _lotId, ...inquiryDetails } = parsed.data;
    console.log('Private sale inquiry:', {
      lot: lot.title,
      lotId: lot.id,
      ...inquiryDetails,
    });

    return NextResponse.json({
      data: { message: 'Inquiry submitted successfully' },
    }, { status: 201 });
  } catch (error) {
    console.error('Inquiry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
