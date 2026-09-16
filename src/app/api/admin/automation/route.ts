import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { automationSettings, users, AUTOMATION_SETTINGS_ROW_ID } from '@/db/schema';
import { logger } from '@/lib/logger';

/**
 * The settings something actually reads — the only keys the admin UI sees or
 * may change. Every other column on automation_settings is inert (see the
 * schema comment) and is neither returned nor accepted, so a stale client
 * sending e.g. `autoInvoiceOnClose` gets a 400 naming the key instead of
 * silently flipping a switch nobody can see.
 *
 * Ranges mirror the `min`/`max` attributes on the settings page inputs.
 */
const patchSchema = z.strictObject({
  // Sales & invoicing — read by src/lib/invoicing/generate-invoice.ts
  invoiceDueDays: z.number().int().min(1).max(365).optional(),
  // Shipping — read by src/lib/payouts/service.ts and src/lib/shipping/service.ts
  autoCreateShipment: z.boolean().optional(),
  requireSignature: z.boolean().optional(),
  whiteGloveThreshold: z.number().int().min(0).optional(), // cents
  // Commission — read by src/lib/payouts/commission.ts
  defaultCommissionPercent: z.number().int().min(0).max(100).optional(),
  highValueCommissionPercent: z.number().int().min(0).max(100).optional(),
  highValueThreshold: z.number().int().min(0).optional(), // cents
  // AI — read by src/lib/ai/email-reply.ts
  aiEmailAutoReply: z.boolean().optional(),
  // Prospect follow-ups — read by src/app/api/cron/prospect-followup/route.ts
  autoFollowUpProspects: z.boolean().optional(),
  followUpDelayHours: z.number().int().min(1).max(720).optional(),
  followUpUploadReminderHours: z.number().int().min(1).max(720).optional(),
  // Notifications — read by src/lib/payouts/service.ts (sale) and the shipping flow
  notifySellerOnSale: z.boolean().optional(),
  notifySellerOnShipment: z.boolean().optional(),
  notifyBuyerOnShipment: z.boolean().optional(),
});

type LiveKey = keyof z.infer<typeof patchSchema>;
const LIVE_KEYS = Object.keys(patchSchema.shape) as LiveKey[];

const updatedByName = sql<string | null>`coalesce(${users.fullName}, ${users.displayName}, ${users.email})`;

function selectRow() {
  return db
    .select({ settings: automationSettings, updatedByName })
    .from(automationSettings)
    .leftJoin(users, eq(users.id, automationSettings.updatedById))
    // Deterministic even if a pre-singleton database still holds two rows:
    // the most recently saved one is what the admin last saw.
    .orderBy(sql`${automationSettings.updatedAt} desc nulls last`, automationSettings.id)
    .limit(1);
}

/**
 * The singleton row. Bootstraps with a fixed id + ON CONFLICT DO NOTHING so
 * two first-ever requests racing can only create one row; the unique index on
 * the table refuses a second row outright.
 */
async function loadRow() {
  let [row] = await selectRow();
  if (!row) {
    await db.insert(automationSettings).values({ id: AUTOMATION_SETTINGS_ROW_ID }).onConflictDoNothing();
    [row] = await selectRow();
  }
  return row;
}

function toResponse(row: Awaited<ReturnType<typeof loadRow>>) {
  const data = Object.fromEntries(LIVE_KEYS.map((k) => [k, row.settings[k]])) as Pick<typeof row.settings, LiveKey>;
  return {
    data,
    updatedAt: row.settings.updatedAt,
    updatedBy: row.settings.updatedById ? { id: row.settings.updatedById, name: row.updatedByName } : null,
  };
}

/** GET /api/admin/automation — the live settings + who last changed them. */
export async function GET() {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    return NextResponse.json(toResponse(await loadRow()));
  } catch (error) {
    logger.error('Get automation settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/automation — partial update; send only the keys that
 * changed. Validation failures answer `{ error, path }` so the page can point
 * at the field.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue.path.length > 0
        ? issue.path.map(String).join('.')
        : 'keys' in issue && Array.isArray(issue.keys) ? String(issue.keys[0]) : undefined;
      return NextResponse.json({ error: issue.message, path }, { status: 400 });
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'No changes to save' }, { status: 400 });
    }

    const row = await loadRow();
    await db
      .update(automationSettings)
      .set({ ...parsed.data, updatedAt: new Date(), updatedById: admin.id })
      .where(eq(automationSettings.id, row.settings.id));

    logger.info('Automation settings updated', { updatedBy: admin.id, keys: Object.keys(parsed.data) });

    return NextResponse.json(toResponse(await loadRow()));
  } catch (error) {
    logger.error('Update automation settings error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
