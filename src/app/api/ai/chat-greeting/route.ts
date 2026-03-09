import { NextResponse } from 'next/server';
import { db } from '@/db';
import { aiChatSettings } from '@/db/schema';

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
    });
  } catch {
    return NextResponse.json({ greeting: null, enabled: true });
  }
}
