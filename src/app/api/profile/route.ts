import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  displayName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  shippingAddress: z.string().max(500).optional(),
  shippingCity: z.string().max(100).optional(),
  shippingState: z.string().max(100).optional(),
  shippingZip: z.string().max(20).optional(),
  shippingCountry: z.string().max(100).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({ user: updated });
  } catch (error) {
    logger.error('Update profile error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
