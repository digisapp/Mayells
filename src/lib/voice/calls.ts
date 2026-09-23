import { generateText } from 'ai';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { calls, sellerProspects } from '@/db/schema';
import { getModel } from '@/lib/ai/client';
import { logger } from '@/lib/logger';

export interface CallTurn {
  role: 'caller' | 'agent';
  text: string;
}

const MAX_TURNS = 400;
const MAX_TURN_CHARS = 2000;

/** Keep whatever the agent sends to a sane, well-typed shape before using it. */
export function cleanTranscript(raw: unknown): CallTurn[] {
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

const NOTES_PROMPT = `You write the message slip for a call to Mayells, an auction house, for the specialist who will follow up.

Write 2-4 short plain sentences: who called, what they have (maker, period, quantity if said), what they want (sell, consign, appraisal, buying, other), anything time-sensitive (estate closing, move date), and what was promised to them (callback, upload link, transfer). No preamble, no bullet points, no markdown, no quotes from the caller. If the call had no real content (silence, wrong number, robocall), say so in one sentence.`;

/**
 * Turn a finished conversation into notes, store them on the call, and add
 * them to the caller's prospect when the call produced a lead. The
 * conversation itself is not kept anywhere: it exists only for the length
 * of this function.
 */
export async function writeCallNotes(callId: string, turns: CallTurn[]) {
  if (turns.length === 0) return;
  try {
    const text = turns
      .map((t) => `${t.role === 'agent' ? 'Mayells' : 'Caller'}: ${t.text}`)
      .join('\n')
      .slice(0, 40_000);
    const { text: raw } = await generateText({
      model: getModel('fast'),
      system: NOTES_PROMPT,
      prompt: text,
      maxOutputTokens: 300,
    });
    const notes = raw.trim();
    if (!notes) return;

    const [call] = await db
      .update(calls)
      .set({ summary: notes })
      .where(eq(calls.id, callId))
      .returning({ prospectId: calls.prospectId });

    if (call?.prospectId) {
      const entry = `[${new Date().toISOString()}] Call notes: ${notes}`;
      await db
        .update(sellerProspects)
        .set({
          notes: sql`case when ${sellerProspects.notes} is null or ${sellerProspects.notes} = '' then ${entry} else ${sellerProspects.notes} || ${'\n\n' + entry} end`,
          updatedAt: new Date(),
        })
        .where(eq(sellerProspects.id, call.prospectId));
    }
  } catch (err) {
    logger.error('Failed to write call notes', err, { callId });
  }
}
