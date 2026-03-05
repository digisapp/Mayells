import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { outreachContacts, users } from '@/db/schema';
import { eq, desc, asc, sql } from 'drizzle-orm';

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
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const conditions = [];
    if (status) {
      conditions.push(eq(outreachContacts.status, status as 'new' | 'contacted' | 'follow_up' | 'interested' | 'converted' | 'not_interested' | 'do_not_contact'));
    }
    if (category) {
      conditions.push(eq(outreachContacts.category, category as 'estate_attorney' | 'trust_estate_planning' | 'elder_law' | 'wealth_management' | 'family_office' | 'cpa_tax' | 'divorce_attorney' | 'insurance' | 'estate_liquidator' | 'real_estate' | 'art_advisor' | 'bank_trust' | 'other'));
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
    console.error('Outreach list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { companyName, contactName, title, email, phone, website, category, source, address, city, state, notes, nextFollowUpAt } = body;

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const [contact] = await db
      .insert(outreachContacts)
      .values({
        companyName,
        contactName: contactName || null,
        title: title || null,
        email: email || null,
        phone: phone || null,
        website: website || null,
        category: category || 'other',
        source: source || null,
        address: address || null,
        city: city || null,
        state: state || null,
        notes: notes || null,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
      })
      .returning();

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    console.error('Outreach create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Convert date strings to Date objects
    if (typeof updates.lastContactedAt === 'string') {
      updates.lastContactedAt = new Date(updates.lastContactedAt);
    }
    if (typeof updates.nextFollowUpAt === 'string') {
      updates.nextFollowUpAt = new Date(updates.nextFollowUpAt);
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
    console.error('Outreach update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await db.delete(outreachContacts).where(eq(outreachContacts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Outreach delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
