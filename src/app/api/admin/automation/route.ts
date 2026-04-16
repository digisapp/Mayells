import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { automationSettings, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const automationPatchSchema = z.object({
  autoApproveConsignments: z.boolean().optional(),
  autoApproveMaxValue: z.number().int().min(0).optional(),
  autoApproveMinConfidence: z.number().int().min(0).max(100).optional(),
  autoApproveRequireAddress: z.boolean().optional(),
  aiAutoCatalog: z.boolean().optional(),
  aiAutoAppraise: z.boolean().optional(),
  requireCatalogReview: z.boolean().optional(),
  autoScheduleAuctions: z.boolean().optional(),
  autoScheduleMinLots: z.number().int().min(1).optional(),
  autoScheduleDayOfWeek: z.number().int().min(0).max(6).optional(),
  autoScheduleHour: z.number().int().min(0).max(23).optional(),
  autoInvoiceOnClose: z.boolean().optional(),
  invoiceDueDays: z.number().int().min(1).max(365).optional(),
  autoCreateShipment: z.boolean().optional(),
  autoGenerateLabel: z.boolean().optional(),
  defaultCarrier: z.string().max(50).optional(),
  requireSignature: z.boolean().optional(),
  requireInsurance: z.boolean().optional(),
  whiteGloveThreshold: z.number().int().min(0).optional(),
  defaultCommissionPercent: z.number().int().min(0).max(100).optional(),
  highValueCommissionPercent: z.number().int().min(0).max(100).optional(),
  highValueThreshold: z.number().int().min(0).optional(),
  aiEmailAutoReply: z.boolean().optional(),
  autoFollowUpProspects: z.boolean().optional(),
  followUpDelayHours: z.number().int().min(1).optional(),
  followUpUploadReminderHours: z.number().int().min(1).optional(),
  notifySellerOnApproval: z.boolean().optional(),
  notifySellerOnSale: z.boolean().optional(),
  notifySellerOnShipment: z.boolean().optional(),
  notifyBuyerOnShipment: z.boolean().optional(),
  sendDailyDigest: z.boolean().optional(),
});

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

    const parsed = automationPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Ensure a row exists
    let [existing] = await db.select().from(automationSettings).limit(1);
    if (!existing) {
      [existing] = await db.insert(automationSettings).values({}).returning();
    }

    // Update
    const [updated] = await db.update(automationSettings).set({
      ...parsed.data,
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
