import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { imageUrls, lotId, ...metadata } = body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: 'imageUrls array required' }, { status: 400 });
    }

    const result = await appraiseLot({ imageUrls, ...metadata });

    // If lotId provided, save AI estimates to the lot
    if (lotId) {
      await db
        .update(lots)
        .set({
          aiEstimateLow: result.estimateLow,
          aiEstimateHigh: result.estimateHigh,
          aiConfidenceScore: String(result.confidence),
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lotId));
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error('AI appraise error', error);
    return NextResponse.json({ error: 'AI appraisal failed' }, { status: 500 });
  }
}
