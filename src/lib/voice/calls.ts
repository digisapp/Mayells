import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { calls, type CallTranscriptTurn } from '@/db/schema';
import { getModel } from '@/lib/ai/client';
import { logger } from '@/lib/logger';

const MAX_TURNS = 400;
const MAX_TURN_CHARS = 2000;

/** Keep whatever the agent sends to a sane, well-typed shape before storing it. */
export function cleanTranscript(raw: unknown): CallTranscriptTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { role: unknown; text: unknown } => !!t && typeof t === 'object')
    .map((t) => ({
      role: t.role === 'agent' ? ('agent' as const) : ('caller' as const),
      text: typeof t.text === 'string' ? t.text.trim().slice(0, MAX_TURN_CHARS) : '',
    }))
    .filter((t) => t.text.length > 0)
    .slice(0, MAX_TURNS);
}

const SUMMARY_PROMPT = `You summarise phone calls to Mayells, an auction house, for the specialist who will follow up.

Write 2-4 short plain sentences: who called, what they have (maker, period, quantity if said), what they want (sell, consign, appraisal, buying, other), anything time-sensitive (estate closing, move date), and what was promised to them (callback, upload link, transfer). No preamble, no bullet points, no markdown. If the call had no real content (silence, wrong number, robocall), say so in one sentence.`;

/**
 * Summarise a finished call and store it. Runs after the response has gone
 * back to the agent; a failure leaves the transcript in place without a
 * summary, which the admin page shows as-is.
 */
export async function summariseCall(callId: string, transcript: CallTranscriptTurn[]) {
  if (transcript.length === 0) return;
  try {
    const text = transcript
      .map((t) => `${t.role === 'agent' ? 'Mayells' : 'Caller'}: ${t.text}`)
      .join('\n')
      .slice(0, 40_000);
    const { text: summary } = await generateText({
      model: getModel('fast'),
      system: SUMMARY_PROMPT,
      prompt: text,
      maxOutputTokens: 300,
    });
    await db.update(calls).set({ summary: summary.trim() }).where(eq(calls.id, callId));
  } catch (err) {
    logger.error('Failed to summarise call', err, { callId });
  }
}
