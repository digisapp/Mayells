import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { sellerProspects, uploadLinks, uploadItems, users } from '@/db/schema';
import { eq, desc, count, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const PROSPECT_SOURCES = ['phone', 'email', 'website', 'referral', 'estate_visit', 'walk_in', 'other'] as const;
const PROSPECT_STATUSES = ['new', 'contacted', 'upload_sent', 'items_received', 'under_review', 'agreement_sent', 'agreement_signed', 'accepted', 'declined', 'archived'] as const;

const prospectBaseFields = {
  fullName: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email().max(320).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zip: z.string().max(20).optional(),
  source: z.enum(PROSPECT_SOURCES).optional(),
  sourceNotes: z.string().max(2000).optional(),
  estimatedItemCount: z.number().int().min(0).optional(),
  itemSummary: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
};

const prospectCreateSchema = z.object(prospectBaseFields);

const prospectPatchSchema = z.object({
  id: z.string().uuid('Valid prospect ID is required'),
  ...Object.fromEntries(
    Object.entries(prospectBaseFields).map(([k, v]) => [k, v.optional()])
  ) as Record<string, z.ZodTypeAny>,
  status: z.enum(PROSPECT_STATUSES).optional(),
  agreedCommissionPercent: z.number().int().min(0).max(100).optional(),
  acceptedItems: z.number().int().min(0).optional(),
  totalEstimateLow: z.number().int().min(0).optional(),
  totalEstimateHigh: z.number().int().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

    const [prospects, [{ total }]] = await Promise.all([
      db
        .select({
          prospect: sellerProspects,
          uploadLinkCount: count(uploadLinks.id),
          uploadItemCount: count(uploadItems.id),
        })
        .from(sellerProspects)
        .leftJoin(uploadLinks, eq(uploadLinks.prospectId, sellerProspects.id))
        .leftJoin(uploadItems, eq(uploadItems.prospectId, sellerProspects.id))
        .groupBy(sellerProspects.id)
        .orderBy(desc(sellerProspects.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(sellerProspects),
    ]);

    return NextResponse.json({
      data: prospects,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.error('Admin prospects fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = prospectCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [created] = await db
      .insert(sellerProspects)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    logger.error('Admin prospect create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = prospectPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, ...fields } = parsed.data;

    const [updated] = await db
      .update(sellerProspects)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(sellerProspects.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin prospect update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
