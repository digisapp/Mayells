import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

    const body = await req.json();
    const parsed = z.object({ email: z.string().email('Valid email is required').max(320) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await db
      .insert(newsletterSubscribers)
      .values({ email: parsed.data.email.toLowerCase().trim() })
      .onConflictDoNothing();

    return NextResponse.json({ data: { message: 'Subscribed' } }, { status: 201 });
  } catch (error) {
    logger.error('Newsletter subscription failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
