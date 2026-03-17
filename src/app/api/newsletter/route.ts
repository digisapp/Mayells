import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { newsletterSubscribers } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success, remaining } = await rateLimit(`newsletter:${ip}`, {
      maxRequests: 5,
      windowSeconds: 3600,
    });
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600', 'X-RateLimit-Remaining': remaining.toString() } },
      );
    }

    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    await db
      .insert(newsletterSubscribers)
      .values({ email: email.toLowerCase().trim() })
      .onConflictDoNothing();

    return NextResponse.json({ data: { message: 'Subscribed' } }, { status: 201 });
  } catch (error) {
    logger.error('Newsletter subscription failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
