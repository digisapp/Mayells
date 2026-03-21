import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { automationSettings, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/automation — get current automation settings
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let [settings] = await db.select().from(automationSettings).limit(1);

    // Create default settings if none exist
    if (!settings) {
      [settings] = await db.insert(automationSettings).values({}).returning();
    }

    return NextResponse.json({ data: settings });
  } catch (error) {
    logger.error('Get automation settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/automation — update automation settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();

    // Ensure a row exists
    let [existing] = await db.select().from(automationSettings).limit(1);
    if (!existing) {
      [existing] = await db.insert(automationSettings).values({}).returning();
    }

    // Update
    const [updated] = await db.update(automationSettings).set({
      ...body,
      updatedAt: new Date(),
      updatedById: user.id,
    }).where(eq(automationSettings.id, existing.id)).returning();

    logger.info('Automation settings updated', { updatedBy: user.id });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update automation settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
