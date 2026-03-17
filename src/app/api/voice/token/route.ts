import { NextResponse } from 'next/server';
import { generateToken } from '@/lib/livekit/config';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
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
