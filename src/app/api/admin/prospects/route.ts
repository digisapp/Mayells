import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { sellerProspects, uploadLinks, uploadItems, users } from '@/db/schema';
import { eq, desc, count, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

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

    const {
      fullName,
      email,
      phone,
      company,
      address,
      city,
      state,
      zip,
      source,
      sourceNotes,
      estimatedItemCount,
      itemSummary,
      notes,
    } = await req.json();

    if (!fullName) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    const [created] = await db
      .insert(sellerProspects)
      .values({
        fullName,
        email,
        phone,
        company,
        address,
        city,
        state,
        zip,
        source,
        sourceNotes,
        estimatedItemCount,
        itemSummary,
        notes,
      })
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

    const { id, ...fields } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });
    }

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
