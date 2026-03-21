import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { consignments, users, lots, categories, automationSettings } from '@/db/schema';
import { eq, desc, ilike } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
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

    const items = await db
      .select({
        consignment: consignments,
        seller: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(consignments)
      .innerJoin(users, eq(consignments.sellerId, users.id))
      .orderBy(desc(consignments.createdAt));

    return NextResponse.json({ data: items });
  } catch (error) {
    logger.error('Admin consignments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const { id, status, reviewNotes, commissionPercent } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }

    const [updated] = await db
      .update(consignments)
      .set({
        status: status as 'submitted' | 'under_review' | 'approved' | 'declined' | 'listed' | 'sold' | 'returned',
        reviewNotes,
        commissionPercent,
        reviewedById: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(consignments.id, id))
      .returning();

    // When approved, auto-create a lot from the consignment + AI data
    if (status === 'approved' && updated) {
      try {
        const lot = await createLotFromConsignment(updated);
        if (lot) {
          // Link the lot back to the consignment
          await db.update(consignments).set({
            lotId: lot.id,
            status: 'listed',
            updatedAt: new Date(),
          }).where(eq(consignments.id, id));

          logger.info('Auto-created lot from consignment', { consignmentId: id, lotId: lot.id });
          return NextResponse.json({ data: { ...updated, lotId: lot.id, lot } });
        }
      } catch (err) {
        logger.error('Failed to auto-create lot from consignment', { consignmentId: id, error: err });
        // Don't fail the approval — lot can be created manually
      }
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Admin consignment review error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Create a lot from an approved consignment, using AI-generated data when available.
 * Falls back to seller-provided data if AI hasn't processed yet.
 */
async function createLotFromConsignment(consignment: typeof consignments.$inferSelect) {
  // Resolve category ID from slug or AI category
  const categorySlug = consignment.aiCategory || consignment.categorySlug;
  const categoryMap: Record<string, string> = {
    art: 'art', fine_art: 'art',
    antiques: 'antiques',
    jewelry: 'jewelry', luxury: 'jewelry',
    fashion: 'fashion',
    collectibles: 'collectibles',
    design: 'design',
  };
  const slug = categoryMap[categorySlug] || categorySlug;

  const [category] = await db.select()
    .from(categories)
    .where(ilike(categories.slug, slug))
    .limit(1);

  if (!category) {
    logger.error('Category not found for consignment', { slug, consignmentId: consignment.id });
    return null;
  }

  // Get automation settings for commission
  const [settings] = await db.select().from(automationSettings).limit(1);
  const estimateHigh = consignment.aiEstimateHigh || consignment.estimatedValue || 0;
  const highValueThreshold = settings?.highValueThreshold || 1000000;

  // Generate a URL-friendly slug
  const title = consignment.aiTitle || consignment.title;
  const lotSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) + '-' + Date.now().toString(36);

  const [lot] = await db.insert(lots).values({
    title: title,
    subtitle: undefined,
    description: consignment.aiDescription || consignment.description || title,
    categoryId: category.id,
    artist: consignment.aiArtist || undefined,
    period: consignment.aiPeriod || undefined,
    medium: consignment.aiMedium || undefined,
    origin: consignment.aiOrigin || undefined,
    condition: (consignment.aiCondition as 'mint' | 'excellent' | 'very_good' | 'good' | 'fair' | 'poor' | 'as_is') || undefined,
    status: 'approved',
    saleType: 'auction',
    estimateLow: consignment.aiEstimateLow || undefined,
    estimateHigh: consignment.aiEstimateHigh || consignment.estimatedValue || undefined,
    reservePrice: consignment.aiEstimateLow ? Math.round(consignment.aiEstimateLow * 0.7) : undefined,
    startingBid: consignment.aiEstimateLow ? Math.round(consignment.aiEstimateLow * 0.4) : undefined,
    sellerId: consignment.sellerId,
    consignmentId: consignment.id,
    primaryImageUrl: consignment.images?.[0] || undefined,
    imageCount: consignment.images?.length || 0,
    slug: lotSlug,
    // AI metadata
    aiDescription: consignment.aiDescription || undefined,
    aiTags: consignment.aiTags || undefined,
    aiEstimateLow: consignment.aiEstimateLow || undefined,
    aiEstimateHigh: consignment.aiEstimateHigh || undefined,
    aiConfidenceScore: consignment.aiConfidence || undefined,
  }).returning();

  return lot;
}
