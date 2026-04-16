import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { inquiries, lots, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const inquiryPatchSchema = z.object({
  id: z.string().uuid('Valid inquiry ID required'),
  status: z.enum(['new', 'contacted', 'in_progress', 'closed']).optional(),
  adminNotes: z.string().max(5000).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allInquiries = await db
      .select({
        inquiry: inquiries,
        lot: {
          id: lots.id,
          title: lots.title,
          primaryImageUrl: lots.primaryImageUrl,
        },
      })
      .from(inquiries)
      .innerJoin(lots, eq(inquiries.lotId, lots.id))
      .orderBy(desc(inquiries.createdAt))
      .limit(200);

    return NextResponse.json({ data: allInquiries });
  } catch (error) {
    logger.error('Admin inquiries fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = inquiryPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { id, ...fields } = parsed.data;
    const updateData: Record<string, unknown> = { updatedAt: new Date(), ...fields };

    const [updated] = await db.update(inquiries).set(updateData).where(eq(inquiries.id, id)).returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin inquiry update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
