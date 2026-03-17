import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { estateVisits, users } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

const createSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  clientAddress: z.string().optional(),
  clientCity: z.string().optional(),
  clientState: z.string().optional(),
  visitDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const visits = await db
      .select()
      .from(estateVisits)
      .orderBy(desc(estateVisits.createdAt))
      .limit(200);

    return NextResponse.json({ data: visits });
  } catch (error) {
    logger.error('Appraisals list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { visitDate, clientEmail, ...rest } = parsed.data;

    const [visit] = await db
      .insert(estateVisits)
      .values({
        ...rest,
        clientEmail: clientEmail || null,
        visitDate: visitDate ? new Date(visitDate) : null,
        reportToken: randomUUID(),
      })
      .returning();

    return NextResponse.json({ data: visit }, { status: 201 });
  } catch (error) {
    logger.error('Appraisal create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    if (updates.visitDate) updates.visitDate = new Date(updates.visitDate);

    const [updated] = await db
      .update(estateVisits)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(estateVisits.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Appraisal update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
