import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { aiChatSettings } from '@/db/schema';
import { logger } from '@/lib/logger';

// Free-text fields: an empty (or whitespace-only) string means "unset" and is
// stored as NULL so the concierge prompt builder falls back to its defaults
// instead of injecting a blank section.
const optionalText = (max: number) =>
  z.string().max(max).nullable().optional().transform((v) => (v && v.trim() !== '' ? v : null));

const aiChatSettingsSchema = z.strictObject({
  personality: optionalText(5000),
  customKnowledge: optionalText(20000),
  upsellItems: optionalText(5000),
  disallowedTopics: optionalText(5000),
  greetingMessage: optionalText(1000),
  enabled: z.boolean().optional(),
});

function selectRow() {
  return db
    .select()
    .from(aiChatSettings)
    .orderBy(sql`${aiChatSettings.updatedAt} desc nulls last`)
    .limit(1);
}

/** GET /api/admin/ai-chat-settings — `data` is null until first saved. */
export async function GET() {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const [settings] = await selectRow();
    return NextResponse.json({ data: settings ?? null });
  } catch (error) {
    logger.error('Get AI chat settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/admin/ai-chat-settings — full replace of the concierge settings. */
export async function PUT(req: Request) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = aiChatSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue.message, path: issue.path.map(String).join('.') || undefined },
        { status: 400 },
      );
    }

    const { personality, customKnowledge, upsellItems, disallowedTopics, greetingMessage, enabled } = parsed.data;
    const values = {
      personality,
      customKnowledge,
      upsellItems,
      disallowedTopics,
      greetingMessage,
      enabled: enabled ?? true,
      updatedAt: new Date(),
    };

    const [existing] = await selectRow();
    if (existing) {
      await db.update(aiChatSettings).set(values).where(eq(aiChatSettings.id, existing.id));
    } else {
      await db.insert(aiChatSettings).values(values);
    }

    const [updated] = await selectRow();
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update AI chat settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
