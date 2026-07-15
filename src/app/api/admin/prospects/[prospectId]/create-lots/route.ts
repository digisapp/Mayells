import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { uploadItems, sellerProspects, users, lots, lotImages, categories, auctionLots, auctions, uploadLinks } from '@/db/schema';
import { eq, and, inArray, ilike, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const categoryMap: Record<string, string> = {
  art: 'art',
  fine_art: 'art',
  antiques: 'antiques',
  jewelry: 'jewelry',
  luxury: 'jewelry',
  fashion: 'fashion',
  collectibles: 'collectibles',
  design: 'design',
};

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prospectId } = await params;
    const body = await request.json();
    const { auctionId, itemIds } = body as { auctionId?: string; itemIds?: string[] };

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (auctionId !== undefined && (typeof auctionId !== 'string' || !UUID_RE.test(auctionId))) {
      return NextResponse.json({ error: 'Invalid auctionId' }, { status: 400 });
    }
    if (itemIds !== undefined && (!Array.isArray(itemIds) || !itemIds.every((i) => typeof i === 'string' && UUID_RE.test(i)))) {
      return NextResponse.json({ error: 'Invalid itemIds' }, { status: 400 });
    }

    // Get the prospect
    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Verify the target auction exists before creating anything, so a bad id
    // returns 400 instead of surfacing as a generic 500 mid-loop.
    if (auctionId) {
      const [auction] = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(eq(auctions.id, auctionId))
        .limit(1);
      if (!auction) {
        return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
      }
    }

    // Get accepted items, optionally filtered by itemIds
    const conditions = [
      eq(uploadItems.prospectId, prospectId),
      eq(uploadItems.status, 'accepted'),
    ];
    if (itemIds && itemIds.length > 0) {
      conditions.push(inArray(uploadItems.id, itemIds));
    }

    const acceptedItems = await db
      .select()
      .from(uploadItems)
      .where(and(...conditions));

    if (acceptedItems.length === 0) {
      return NextResponse.json({ error: 'No accepted items found' }, { status: 404 });
    }

    // Pre-fetch all categories for slug lookup
    const allCategories = await db.select().from(categories);

    // All writes (lots + images + item updates + auction assignment + lot count)
    // must commit together — a mid-loop failure otherwise orphans lots and
    // drifts the auction's lotCount with no rollback.
    const createdLots = await db.transaction(async (tx) => {
    const created: { lotId: string; itemId: string }[] = [];

    for (const item of acceptedItems) {
      // Resolve category
      const rawCategory = item.finalCategory || item.aiCategory;
      const mappedSlug = rawCategory ? categoryMap[rawCategory.toLowerCase()] || rawCategory.toLowerCase() : null;
      let categoryId: string | null = null;

      if (mappedSlug) {
        const matched = allCategories.find(
          (c) => c.slug.toLowerCase() === mappedSlug.toLowerCase()
        );
        if (matched) {
          categoryId = matched.id;
        }
      }

      // Fallback: use first category if none matched
      if (!categoryId && allCategories.length > 0) {
        // Try a broader ilike search against the database
        if (mappedSlug) {
          const [dbMatch] = await tx
            .select()
            .from(categories)
            .where(ilike(categories.slug, mappedSlug))
            .limit(1);
          if (dbMatch) {
            categoryId = dbMatch.id;
          }
        }
        // Ultimate fallback
        if (!categoryId) {
          categoryId = allCategories[0].id;
        }
      }

      const title = item.finalTitle || item.aiTitle || item.sellerTitle || 'Untitled';
      const slug = generateSlug(title);

      // Insert lot
      const [lot] = await tx
        .insert(lots)
        .values({
          title,
          description: item.finalDescription || item.aiDescription || '',
          categoryId: categoryId!,
          artist: item.aiArtist,
          period: item.aiPeriod,
          medium: item.aiMedium,
          origin: item.aiOrigin,
          condition: (['mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is'].includes(item.aiCondition ?? '')
            ? (item.aiCondition as typeof lots.$inferInsert.condition)
            : null),
          status: 'approved',
          saleType: 'auction',
          estimateLow: item.finalEstimateLow ?? item.aiEstimateLow,
          estimateHigh: item.finalEstimateHigh ?? item.aiEstimateHigh,
          reservePrice: item.finalReserve ?? item.aiRecommendedReserve,
          startingBid: item.aiSuggestedStartingBid,
          sellerId: prospect.userId,
          primaryImageUrl: item.images?.[0] ?? null,
          imageCount: item.images?.length ?? 0,
          slug,
          aiDescription: item.aiDescription,
          aiTags: item.aiTags,
          aiEstimateLow: item.aiEstimateLow,
          aiEstimateHigh: item.aiEstimateHigh,
          aiConfidenceScore: item.aiConfidence ? item.aiConfidence : null,
        })
        .returning();

      // Create lot images
      if (item.images && item.images.length > 0) {
        const imageValues = item.images.map((imageUrl, index) => ({
          lotId: lot.id,
          url: imageUrl,
          isPrimary: index === 0,
          sortOrder: index,
        }));
        await tx.insert(lotImages).values(imageValues);
      }

      // Update uploadItem
      await tx
        .update(uploadItems)
        .set({
          status: 'lot_created',
          lotId: lot.id,
          ...(auctionId ? { auctionId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(uploadItems.id, item.id));

      created.push({ lotId: lot.id, itemId: item.id });
    }

    // If auctionId provided, assign lots to auction
    if (auctionId) {
      const auctionLotValues = created.map((entry, index) => ({
        auctionId,
        lotId: entry.lotId,
        lotNumber: index + 1,
      }));
      await tx.insert(auctionLots).values(auctionLotValues);

      // Update auction lot count
      await tx
        .update(auctions)
        .set({
          lotCount: sql`${auctions.lotCount} + ${created.length}`,
          updatedAt: new Date(),
        })
        .where(eq(auctions.id, auctionId));
    }

      // Retire this prospect's upload links now that their items have been
      // turned into lots — otherwise the tokenized URL stays 'active' forever
      // and anyone who ever had it can keep injecting items (and reading the
      // prospect's name) into a closed consignment.
      await tx
        .update(uploadLinks)
        .set({ status: 'completed' })
        .where(and(eq(uploadLinks.prospectId, prospectId), eq(uploadLinks.status, 'active')));

    return created;
    });

    logger.info('Lots created from prospect items', {
      prospectId,
      lotsCreated: createdLots.length,
      auctionId: auctionId ?? null,
    });

    return NextResponse.json({
      lotsCreated: createdLots.length,
      auctionId: auctionId ?? null,
    });
  } catch (error) {
    logger.error('Error creating lots from prospect items', { error });
    return NextResponse.json(
      { error: 'Failed to create lots' },
      { status: 500 }
    );
  }
}
