import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { calls } from '@/db/schema';
import { rejectUnlessVoiceAgent } from '@/lib/voice/agent-auth';
import { getMicrositeByNumber, getMicrositeBySlug } from '@/lib/microsites/config';
import { logger } from '@/lib/logger';

const startSchema = z.object({
  roomName: z.string().min(1).max(200),
  channel: z.enum(['phone', 'web']),
  callerNumber: z.string().max(40).optional(),
  calledNumber: z.string().max(40).optional(),
  /** Browser calls say which city page they started on. */
  site: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
});

/**
 * Called by the voice agent as it joins a call. Opens the call record and
 * tells the agent which city line was dialled, so it can greet the caller as
 * the Jupiter office rather than a generic switchboard.
 */
export async function POST(req: NextRequest) {
  const rejected = rejectUnlessVoiceAgent(req);
  if (rejected) return rejected;

  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { roomName, channel, callerNumber, calledNumber } = parsed.data;

  const site = channel === 'phone'
    ? getMicrositeByNumber(calledNumber)
    : parsed.data.site ? getMicrositeBySlug(parsed.data.site) : undefined;

  try {
    // The agent retries on a network blip; the room name makes that a no-op.
    await db
      .insert(calls)
      .values({
        roomName,
        channel,
        callerNumber: callerNumber || null,
        calledNumber: calledNumber || null,
        site: site?.slug ?? null,
      })
      .onConflictDoNothing({ target: calls.roomName });
    const [call] = await db.select({ id: calls.id }).from(calls).where(eq(calls.roomName, roomName)).limit(1);

    return NextResponse.json({
      data: {
        callId: call.id,
        site: site ? { slug: site.slug, city: site.city, serviceModel: site.serviceModel } : null,
      },
    });
  } catch (error) {
    logger.error('Voice agent call start failed', error, { roomName });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
