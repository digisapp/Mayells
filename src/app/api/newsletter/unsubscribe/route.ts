import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { newsletterSubscribers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const unsubscribeSchema = z.object({
  email: z.string().email('Valid email is required').max(320),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = unsubscribeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const normalized = parsed.data.email.toLowerCase().trim();

    await db
      .update(newsletterSubscribers)
      .set({ unsubscribed: true })
      .where(eq(newsletterSubscribers.email, normalized));

    return NextResponse.json({ data: { message: 'Unsubscribed successfully' } });
  } catch (error) {
    logger.error('Newsletter unsubscribe failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
