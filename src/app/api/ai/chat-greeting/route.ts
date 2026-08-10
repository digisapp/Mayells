import { NextResponse } from 'next/server';
import { db } from '@/db';
import { aiChatSettings } from '@/db/schema';

// The greeting changes ~never; cache at the CDN so opening the chat doesn't
// pay a lambda + DB query per visitor.
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

export async function GET() {
  try {
    const [settings] = await db
      .select({
        greetingMessage: aiChatSettings.greetingMessage,
        enabled: aiChatSettings.enabled,
      })
      .from(aiChatSettings)
      .limit(1);

    return NextResponse.json({
      greeting: settings?.greetingMessage || null,
      enabled: settings?.enabled ?? true,
    }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ greeting: null, enabled: true }, { headers: CACHE_HEADERS });
  }
}
