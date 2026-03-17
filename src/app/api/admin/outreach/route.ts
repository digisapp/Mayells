import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { outreachContacts, users } from '@/db/schema';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const CATEGORIES = [
  'estate_attorney', 'trust_estate_planning', 'elder_law', 'wealth_management',
  'family_office', 'cpa_tax', 'divorce_attorney', 'insurance',
  'estate_liquidator', 'real_estate', 'art_advisor', 'bank_trust', 'other',
] as const;

const STATUSES = [
  'new', 'contacted', 'follow_up', 'interested',
  'converted', 'not_interested', 'do_not_contact',
] as const;

const createContactSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(300),
  contactName: z.string().max(200).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  email: z.string().email().max(300).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  website: z.string().url().max(500).optional().nullable().or(z.literal('')),
  category: z.enum(CATEGORIES).optional().default('other'),
  source: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
});

const updateContactSchema = z.object({
  id: z.string().uuid('Invalid contact ID'),
  companyName: z.string().min(1).max(300).optional(),
  contactName: z.string().max(200).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  email: z.string().email().max(300).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  website: z.string().url().max(500).optional().nullable().or(z.literal('')),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  source: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  lastContactedAt: z.string().datetime().optional().nullable(),
  nextFollowUpAt: z.string().datetime().optional().nullable(),
});

const filterSchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const parsed = filterSchema.safeParse({
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid filter parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const conditions = [];
    if (parsed.data.status) {
      conditions.push(eq(outreachContacts.status, parsed.data.status));
    }
    if (parsed.data.category) {
      conditions.push(eq(outreachContacts.category, parsed.data.category));
    }

    const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    const contacts = await db
      .select()
      .from(outreachContacts)
      .where(where)
      .orderBy(asc(outreachContacts.nextFollowUpAt), desc(outreachContacts.createdAt))
      .limit(500);

    return NextResponse.json({ data: contacts });
  } catch (error) {
    logger.error('Outreach list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parsed = createContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { nextFollowUpAt, email, website, ...rest } = parsed.data;

    const [contact] = await db
      .insert(outreachContacts)
      .values({
        ...rest,
        email: email || null,
        website: website || null,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
      })
      .returning();

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    logger.error('Outreach create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parsed = updateContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, lastContactedAt, nextFollowUpAt, email, website, ...rest } = parsed.data;

    const updates: Record<string, unknown> = { ...rest };
    if (email !== undefined) updates.email = email || null;
    if (website !== undefined) updates.website = website || null;
    if (lastContactedAt !== undefined) updates.lastContactedAt = lastContactedAt ? new Date(lastContactedAt) : null;
    if (nextFollowUpAt !== undefined) updates.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt) : null;

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

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parsed = z.object({ id: z.string().uuid() }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid UUID id is required' }, { status: 400 });
    }

    await db.delete(outreachContacts).where(eq(outreachContacts.id, parsed.data.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Outreach delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
