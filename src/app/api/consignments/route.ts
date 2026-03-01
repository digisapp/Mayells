import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { consignments } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { consignmentSchema } from '@/lib/validation/schemas';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const items = await db
      .select()
      .from(consignments)
      .where(eq(consignments.sellerId, user.id))
      .orderBy(desc(consignments.createdAt));

    return NextResponse.json({ data: items });
  } catch (error) {
    console.error('Consignments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = consignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
    }

    const [entry] = await db
      .insert(consignments)
      .values({
        sellerId: user.id,
        ...parsed.data,
      })
      .returning();

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error('Create consignment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
