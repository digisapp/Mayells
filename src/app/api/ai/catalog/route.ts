import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { catalogLotFromImages } from '@/lib/ai/cataloging';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Admin only
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { imageUrls, lotId } = await request.json();
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: 'imageUrls array required' }, { status: 400 });
    }

    const result = await catalogLotFromImages(imageUrls);

    // If lotId provided, update the lot with AI-generated data
    if (lotId) {
      await db
        .update(lots)
        .set({
          aiDescription: result.description,
          aiTags: result.tags,
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lotId));
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('AI catalog error:', error);
    return NextResponse.json({ error: 'AI cataloging failed' }, { status: 500 });
  }
}
