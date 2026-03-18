import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { newsletterSubscribers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();

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
