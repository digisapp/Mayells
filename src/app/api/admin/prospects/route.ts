import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { sellerProspects, uploadLinks, uploadItems } from '@/db/schema';
import { eq, desc, countDistinct, sql, or, ilike, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { parsePagination } from '@/lib/pagination';

const PROSPECT_SOURCES = ['phone', 'email', 'website', 'referral', 'estate_visit', 'walk_in', 'other'] as const;
const PROSPECT_STATUSES = ['new', 'contacted', 'upload_sent', 'items_received', 'under_review', 'agreement_sent', 'agreement_signed', 'accepted', 'declined', 'archived'] as const;
type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

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
  fullName: prospectBaseFields.fullName.optional(),
  email: prospectBaseFields.email,
  phone: prospectBaseFields.phone,
  company: prospectBaseFields.company,
  address: prospectBaseFields.address,
  city: prospectBaseFields.city,
  state: prospectBaseFields.state,
  zip: prospectBaseFields.zip,
  source: prospectBaseFields.source,
  sourceNotes: prospectBaseFields.sourceNotes,
  estimatedItemCount: prospectBaseFields.estimatedItemCount,
  itemSummary: prospectBaseFields.itemSummary,
  notes: prospectBaseFields.notes,
  status: z.enum(PROSPECT_STATUSES).optional(),
  agreedCommissionPercent: z.number().int().min(0).max(100).optional(),
  acceptedItems: z.number().int().min(0).optional(),
  totalEstimateLow: z.number().int().min(0).optional(),
  totalEstimateHigh: z.number().int().min(0).optional(),
});

// Optional text columns: an empty string from a form means "clear it".
const NULLABLE_TEXT_FIELDS = ['email', 'phone', 'company', 'address', 'city', 'state', 'zip', 'sourceNotes', 'itemSummary', 'notes'] as const;

function blankToNull<T extends Record<string, unknown>>(fields: T): T {
  const out: Record<string, unknown> = { ...fields };
  for (const key of NULLABLE_TEXT_FIELDS) {
    if (typeof out[key] === 'string' && (out[key] as string).trim() === '') out[key] = null;
  }
  return out as T;
}

export async function GET(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { limit, offset } = parsePagination(request.nextUrl.searchParams, { defaultLimit: 50, maxLimit: 100 });

    // Server-side search across the whole table (the client used to filter
    // only the loaded page). Escape LIKE wildcards in the user's input.
    const rawSearch = request.nextUrl.searchParams.get('search')?.trim().slice(0, 200) ?? '';
    const pattern = rawSearch ? `%${rawSearch.replace(/[\\%_]/g, '\\$&')}%` : null;

    // Funnel filter: ?status=a,b,c (unknown values are ignored).
    const statusFilter = (request.nextUrl.searchParams.get('status') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ProspectStatus => (PROSPECT_STATUSES as readonly string[]).includes(s));

    const filters = [];
    if (pattern) {
      filters.push(
        or(
          ilike(sellerProspects.fullName, pattern),
          ilike(sellerProspects.email, pattern),
          ilike(sellerProspects.phone, pattern),
          ilike(sellerProspects.company, pattern),
        ),
      );
    }
    if (statusFilter.length > 0) {
      filters.push(inArray(sellerProspects.status, statusFilter));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const listQuery = db
      .select({
        prospect: sellerProspects,
        // count DISTINCT — joining both uploadLinks and uploadItems produces a
        // cartesian product (links × items rows per prospect), so a plain
        // count() would inflate both totals.
        uploadLinkCount: countDistinct(uploadLinks.id),
        uploadItemCount: countDistinct(uploadItems.id),
      })
      .from(sellerProspects)
      .leftJoin(uploadLinks, eq(uploadLinks.prospectId, sellerProspects.id))
      .leftJoin(uploadItems, eq(uploadItems.prospectId, sellerProspects.id))
      .where(where)
      .groupBy(sellerProspects.id)
      .orderBy(desc(sellerProspects.createdAt))
      .limit(limit)
      .offset(offset);

    const [prospects, [globalStats], byStatusRows, filteredCount] = await Promise.all([
      listQuery,
      // Global (unfiltered) stats for the dashboard cards. "Awaiting review"
      // is everything that has items but no decision yet; "signed" covers
      // signed agreements whether or not lots have been created since.
      db
        .select({
          total: sql<number>`count(*)::int`,
          newLeads: sql<number>`count(*) filter (where ${sellerProspects.status} in ('new', 'contacted'))::int`,
          awaitingReview: sql<number>`count(*) filter (where ${sellerProspects.status} in ('items_received', 'under_review'))::int`,
          signed: sql<number>`count(*) filter (where ${sellerProspects.status} in ('agreement_signed', 'accepted'))::int`,
        })
        .from(sellerProspects),
      db
        .select({ status: sellerProspects.status, count: sql<number>`count(*)::int` })
        .from(sellerProspects)
        .groupBy(sellerProspects.status),
      where
        ? db.select({ total: sql<number>`count(*)::int` }).from(sellerProspects).where(where)
        : Promise.resolve(null),
    ]);

    const total = filteredCount ? filteredCount[0].total : globalStats.total;
    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row.status] = row.count;

    return NextResponse.json({
      data: prospects,
      stats: { ...globalStats, byStatus },
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.error('Admin prospects fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = prospectCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [created] = await db
      .insert(sellerProspects)
      .values(blankToNull(parsed.data))
      .returning();

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    logger.error('Admin prospect create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = prospectPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, ...fields } = parsed.data;

    const [updated] = await db
      .update(sellerProspects)
      .set({ ...blankToNull(fields), updatedAt: new Date() })
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
