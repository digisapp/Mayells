import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/livekit/config';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success } = await rateLimit(`voice:token:${ip}`, { maxRequests: 10, windowSeconds: 3600 });
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }
    const participantId = `guest-${randomUUID()}`;
    const roomName = `call-${randomUUID()}`;

    const token = await generateToken({
      roomName,
      participantName: 'Website Visitor',
      participantIdentity: participantId,
      isPublisher: true,
    });

    return NextResponse.json({
      token,
      roomName,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    });
  } catch (error) {
    logger.error('Voice token error', error);
    return NextResponse.json(
      { error: 'Failed to generate voice token' },
      { status: 500 },
    );
  }
}
