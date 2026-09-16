import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { outreachContacts } from '@/db/schema';
import { eq, desc, asc, sql, and, or, ilike, inArray, notInArray, lte, isNotNull } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { containsPattern } from '@/lib/db/like';
import { OUTREACH_CATEGORIES, OUTREACH_STATUSES, OUTREACH_CLOSED_STATUSES } from '@/lib/config/outreach';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 50;

// ─── Validation ──────────────────────────────────────────────────────────────

/** Optional free text: '' and whitespace become null, everything else is trimmed. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
    z.string().max(max).nullable().optional(),
  );

/** Optional email, normalised to lowercase; '' → null. */
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toLowerCase()) : v),
  z.string().email('Enter a valid email address').max(300).nullable().optional(),
);

/** Optional website: bare domains get https:// prefixed before URL validation. */
const optionalWebsite = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (t === '') return null;
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  },
  z.string().url('Enter a valid website (e.g. example.com)').max(500).nullable().optional(),
);

/** A calendar day (YYYY-MM-DD). ISO datetimes are accepted and truncated. */
const optionalDay = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (t === '') return null;
    return /^\d{4}-\d{2}-\d{2}T/.test(t) ? t.slice(0, 10) : t;
  },
  z.iso.date('Enter a date').nullable().optional(),
);

/** A timestamp; a bare YYYY-MM-DD is taken as noon that day so it never shifts a day across timezones. */
const optionalInstant = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (t === '') return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00.000Z` : t;
  },
  z.iso.datetime({ offset: true, message: 'Enter a date' }).nullable().optional(),
);

const contactFields = {
  companyName: z.string().trim().min(1, 'Company name is required').max(300),
  contactName: optionalText(200),
  title: optionalText(200),
  email: optionalEmail,
  phone: optionalText(50),
  website: optionalWebsite,
  category: z.enum(OUTREACH_CATEGORIES),
  status: z.enum(OUTREACH_STATUSES),
  source: optionalText(200),
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(50),
  notes: optionalText(5000),
  lastContactedAt: optionalInstant,
  nextFollowUpAt: optionalDay,
};

const createContactSchema = z.object({
  ...contactFields,
  category: contactFields.category.default('other'),
  status: contactFields.status.optional(),
});

const updateContactSchema = z.object({
  id: z.string().uuid('Invalid contact ID'),
  ...contactFields,
  companyName: contactFields.companyName.optional(),
  category: contactFields.category.optional(),
  status: contactFields.status.optional(),
  /** Stamp lastContactedAt = now without changing anything else. */
  logContact: z.literal(true).optional(),
});

const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(OUTREACH_STATUSES),
});

const listQuerySchema = z.object({
  status: z.enum(OUTREACH_STATUSES).optional(),
  category: z.enum(OUTREACH_CATEGORIES).optional(),
  search: z.string().max(200).optional(),
  due: z.enum(['1', 'true']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

function validationError(error: z.ZodError) {
  const { fieldErrors, formErrors } = z.flattenError(error);
  const first = error.issues[0];
  const label = first?.path?.length ? `${String(first.path[0])}: ${first.message}` : first?.message;
  return NextResponse.json(
    { error: label || 'Validation failed', details: { ...fieldErrors, ...(formErrors.length && { _form: formErrors }) } },
    { status: 400 },
  );
}

/** The "due" predicate: follow-up on/before today and the lead is still open. */
const dueCondition = and(
  isNotNull(outreachContacts.nextFollowUpAt),
  lte(outreachContacts.nextFollowUpAt, sql`current_date`),
  notInArray(outreachContacts.status, [...OUTREACH_CLOSED_STATUSES]),
);

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { searchParams } = new URL(req.url);

    // Single-contact fetch: GET /api/admin/outreach?id=<uuid>
    const id = searchParams.get('id');
    if (id) {
      const parsedId = z.string().uuid('Invalid contact ID').safeParse(id);
      if (!parsedId.success) {
        return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
      }
      const [contact] = await db
        .select()
        .from(outreachContacts)
        .where(eq(outreachContacts.id, parsedId.data))
        .limit(1);
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      return NextResponse.json({ data: contact });
    }

    const parsed = listQuerySchema.safeParse({
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search')?.trim() || undefined,
      due: searchParams.get('due') || undefined,
      page: searchParams.get('page') || undefined,
    });
    if (!parsed.success) return validationError(parsed.error);

    const { status, category, search, due, page } = parsed.data;
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    if (status) conditions.push(eq(outreachContacts.status, status));
    if (category) conditions.push(eq(outreachContacts.category, category));
    if (due) conditions.push(dueCondition!);
    if (search) {
      const pattern = containsPattern(search);
      conditions.push(
        or(
          ilike(outreachContacts.companyName, pattern),
          ilike(outreachContacts.contactName, pattern),
          ilike(outreachContacts.email, pattern),
          ilike(outreachContacts.phone, pattern),
          ilike(outreachContacts.city, pattern),
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [contacts, [{ total }], [statsRow]] = await Promise.all([
      db
        .select()
        .from(outreachContacts)
        .where(where)
        .orderBy(asc(outreachContacts.nextFollowUpAt), desc(outreachContacts.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(outreachContacts).where(where),
      // Global (unfiltered) pipeline numbers for the header cards
      db
        .select({
          total: sql<number>`count(*)::int`,
          new: sql<number>`count(*) filter (where ${outreachContacts.status} = 'new')::int`,
          followUp: sql<number>`count(*) filter (where ${outreachContacts.status} = 'follow_up')::int`,
          interested: sql<number>`count(*) filter (where ${outreachContacts.status} = 'interested')::int`,
          converted: sql<number>`count(*) filter (where ${outreachContacts.status} = 'converted')::int`,
          due: sql<number>`count(*) filter (where ${dueCondition})::int`,
        })
        .from(outreachContacts),
    ]);

    return NextResponse.json({
      data: contacts,
      stats: statsRow,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Outreach list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = createContactSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);

    const { lastContactedAt, ...rest } = parsed.data;

    const [contact] = await db
      .insert(outreachContacts)
      .values({
        ...rest,
        lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null,
      })
      .returning();

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    logger.error('Outreach create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

const CONTACT_STAMP_STATUSES = ['contacted', 'follow_up'];

export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const body = await req.json().catch(() => null);

    // Bulk: { ids, status }
    if (body && Array.isArray(body.ids)) {
      const parsed = bulkStatusSchema.safeParse(body);
      if (!parsed.success) return validationError(parsed.error);
      const { ids, status } = parsed.data;

      const updated = await db
        .update(outreachContacts)
        .set({
          status,
          ...(CONTACT_STAMP_STATUSES.includes(status) && { lastContactedAt: sql`now()` }),
          updatedAt: sql`now()`,
        })
        .where(inArray(outreachContacts.id, ids))
        .returning();

      const updatedIds = new Set(updated.map((c) => c.id));
      const missing = ids.filter((i) => !updatedIds.has(i));
      return NextResponse.json({ data: updated, updated: updated.length, missing });
    }

    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { id, lastContactedAt, logContact, ...rest } = parsed.data;

    const [current] = await db
      .select({ status: outreachContacts.status })
      .from(outreachContacts)
      .where(eq(outreachContacts.id, id))
      .limit(1);
    if (!current) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Only fields the client actually sent are written (undefined = untouched)
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) updates[key] = value;
    }
    if (lastContactedAt !== undefined) {
      updates.lastContactedAt = lastContactedAt ? new Date(lastContactedAt) : null;
    } else if (
      logContact ||
      (rest.status && rest.status !== current.status && CONTACT_STAMP_STATUSES.includes(rest.status))
    ) {
      // Moving into contacted/follow_up (or an explicit "log contact") is a
      // touch; other status changes leave the last-contacted date alone.
      updates.lastContactedAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const [updated] = await db
      .update(outreachContacts)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(outreachContacts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Outreach update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid UUID id is required' }, { status: 400 });
    }

    const deleted = await db
      .delete(outreachContacts)
      .where(eq(outreachContacts.id, parsed.data.id))
      .returning({ id: outreachContacts.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Outreach delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
