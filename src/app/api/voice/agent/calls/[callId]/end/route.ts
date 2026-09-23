import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { calls } from '@/db/schema';
import { rejectUnlessVoiceAgent } from '@/lib/voice/agent-auth';
import { cleanTranscript, writeCallNotes } from '@/lib/voice/calls';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const endSchema = z.object({
  transcript: z.array(z.unknown()).max(2000),
  transferred: z.boolean().optional(),
});

/**
 * Called by the agent when the call ends (hang-up, transfer, or the length
 * cap). Closes the call, then writes notes from the conversation after
 * responding, so the agent's shutdown is not held up by a model call. The
 * conversation is never stored; see writeCallNotes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const rejected = rejectUnlessVoiceAgent(req);
  if (rejected) return rejected;

  const { callId } = await params;
  if (!UUID_RE.test(callId)) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

  const parsed = endSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    if (call.endedAt) return NextResponse.json({ data: { ok: true } });

    const turns = cleanTranscript(parsed.data.transcript);
    const endedAt = new Date();
    // Conditional on ended_at so two racing end requests write notes once.
    // A transfer never hides a lead: the lead is what the admin filters on.
    const [ended] = await db
      .update(calls)
      .set({
        endedAt,
        durationSeconds: Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)),
        ...(parsed.data.transferred
          ? { outcome: sql`case when ${calls.outcome} = 'lead' then ${calls.outcome} else 'transferred' end` }
          : {}),
      })
      .where(and(eq(calls.id, callId), isNull(calls.endedAt)))
      .returning({ id: calls.id });

    if (ended) after(() => writeCallNotes(callId, turns));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    logger.error('Voice agent call end failed', error, { callId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
