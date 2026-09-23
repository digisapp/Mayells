import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * The voice agent (agents/voice-agent) is a separate Python worker, so it
 * reaches the app over HTTP with a shared bearer secret rather than a user
 * session. Returns a response to send back when the request is not from the
 * agent, or null when it is.
 */
export function rejectUnlessVoiceAgent(req: NextRequest): NextResponse | null {
  const secret = process.env.VOICE_AGENT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Voice agent is not configured' }, { status: 503 });
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(req.headers.get('authorization') ?? '');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
