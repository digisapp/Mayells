import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, aiChatSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [settings] = await db.select().from(aiChatSettings).limit(1);
    return NextResponse.json({ data: settings || null });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { personality, customKnowledge, upsellItems, disallowedTopics, greetingMessage, enabled } = body;

    const [existing] = await db.select({ id: aiChatSettings.id }).from(aiChatSettings).limit(1);

    if (existing) {
      await db.update(aiChatSettings).set({
        personality: personality || null,
        customKnowledge: customKnowledge || null,
        upsellItems: upsellItems || null,
        disallowedTopics: disallowedTopics || null,
        greetingMessage: greetingMessage || null,
        enabled: enabled ?? true,
        updatedAt: new Date(),
      }).where(eq(aiChatSettings.id, existing.id));
    } else {
      await db.insert(aiChatSettings).values({
        personality: personality || null,
        customKnowledge: customKnowledge || null,
        upsellItems: upsellItems || null,
        disallowedTopics: disallowedTopics || null,
        greetingMessage: greetingMessage || null,
        enabled: enabled ?? true,
      });
    }

    const [updated] = await db.select().from(aiChatSettings).limit(1);
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
