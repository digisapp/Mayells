import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { uploadItems, sellerProspects, users, lots, lotImages, categories, auctionLots, auctions, uploadLinks } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { ensureProspectSellerUser, isSentinelEmail } from '@/lib/sellers/shadow';
import { portalUrl } from '@/lib/sellers/portal';
import { sendConsignorPortalEmail, sendProspectAcceptedNotification } from '@/lib/email/notifications';
import { revalidatePublicCatalog } from '@/lib/revalidate';

const bodySchema = z.object({
  auctionId: z.string().uuid('Invalid auctionId').optional(),
  itemIds: z.array(z.string().uuid('Invalid itemIds')).max(500).optional(),
  // Lots may be created before the consignor signs only when the admin
  // explicitly opts in AND records the commission the lots are sold under.
  skipAgreement: z.boolean().optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
});

// AI category labels → catalog category slugs. Anything not listed here is
// tried verbatim against the categories table (slug, then name).
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

// Sellers can upload clips alongside photos; the lot's image columns and
// lot_images must only ever reference stills.
const VIDEO_URL_RE = /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i;

// Only a sale that has not started taking bids can absorb a batch of new
// lots; live/closed sales are handled lot-by-lot by the auction editor.
const ASSIGNABLE_AUCTION_STATUSES = ['draft', 'scheduled', 'preview'] as const;

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Name of the unique index/constraint behind a Postgres 23505 error, or null.
 * Drizzle wraps driver errors (the pg DatabaseError lives on `cause`).
 */
function uniqueViolationConstraint(err: unknown): string | null {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  for (const c of candidates) {
    const e = c as { code?: string; constraint?: string } | undefined;
    if (e?.code === '23505') return e.constraint ?? '';
  }
  return null;
}

/** Thrown inside the transaction to roll back and surface a 409. */
class LotNumberConflictError extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { prospectId } = await params;
    if (!UUID_RE.test(prospectId)) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { auctionId, itemIds, skipAgreement, commissionPercent } = parsed.data;

    const [prospect] = await db
      .select()
      .from(sellerProspects)
      .where(eq(sellerProspects.id, prospectId))
      .limit(1);

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Agreement gate: a signed agreement, or an explicit override that also
    // records the commission the consignment is sold under.
    if (!prospect.agreementSignedAt) {
      if (!skipAgreement) {
        return NextResponse.json(
          { error: 'The consignment agreement has not been signed. Wait for the consignor to sign, or confirm creating lots without a signature and record the commission.' },
          { status: 409 },
        );
      }
      if (commissionPercent === undefined) {
        return NextResponse.json(
          { error: 'commissionPercent is required when creating lots before the agreement is signed' },
          { status: 400 },
        );
      }
    }

    // Validate the target auction before creating anything.
    let auctionSlug: string | null = null;
    if (auctionId) {
      const [auction] = await db
        .select({ id: auctions.id, status: auctions.status, slug: auctions.slug })
        .from(auctions)
        .where(eq(auctions.id, auctionId))
        .limit(1);
      if (!auction) {
        return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
      }
      if (!(ASSIGNABLE_AUCTION_STATUSES as readonly string[]).includes(auction.status)) {
        return NextResponse.json(
          { error: `This sale is ${auction.status}; lots can only be added to a draft, scheduled, or preview sale.` },
          { status: 409 },
        );
      }
      auctionSlug = auction.slug;
    }

    // Accepted items, optionally narrowed to the requested ids.
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
      .where(and(...conditions))
      .orderBy(uploadItems.sortOrder);

    if (acceptedItems.length === 0) {
      return NextResponse.json({ error: 'No accepted items found' }, { status: 404 });
    }

    // Resolve every item's category up front so a mismatch fails the whole
    // request with a clear message instead of silently filing the lot under
    // whichever category happened to be first.
    const allCategories = await db.select().from(categories);
    const categoryFor = new Map<string, string>();
    for (const item of acceptedItems) {
      const rawCategory = (item.finalCategory || item.aiCategory || '').trim();
      const wanted = rawCategory ? (categoryMap[rawCategory.toLowerCase()] ?? rawCategory).toLowerCase() : '';
      const matched = wanted
        ? allCategories.find(
            (c) => c.slug.toLowerCase() === wanted || c.name.toLowerCase() === wanted || c.name.toLowerCase() === rawCategory.toLowerCase(),
          )
        : undefined;
      if (!matched) {
        const label = item.finalTitle || item.aiTitle || item.sellerTitle || 'Untitled';
        return NextResponse.json(
          {
            error: rawCategory
              ? `"${label}" has category "${rawCategory}", which doesn't match any catalog category. Override its category and try again.`
              : `"${label}" has no category. Override its category and try again.`,
            itemId: item.id,
          },
          { status: 400 },
        );
      }
      categoryFor.set(item.id, matched.id);
    }

    // All writes (lots + images + item updates + auction assignment + lot
    // count + prospect status) commit together.
    let result: { created: { lotId: string; itemId: string }[]; sellerId: string };
    try {
      result = await db.transaction(async (tx) => {
        // Every lot needs a seller-of-record so shipping and payouts can
        // settle. Prospects usually have no account — mint (or link) one.
        const sellerId = await ensureProspectSellerUser(tx, prospect);

        const created: { lotId: string; itemId: string }[] = [];

        for (const item of acceptedItems) {
          const stills = (item.images ?? []).filter((url) => !VIDEO_URL_RE.test(url));
          const title = item.finalTitle || item.aiTitle || item.sellerTitle || 'Untitled';
          const slug = generateSlug(title);

          const [lot] = await tx
            .insert(lots)
            .values({
              title,
              subtitle: item.aiSubtitle,
              description: item.finalDescription || item.aiDescription || '',
              categoryId: categoryFor.get(item.id)!,
              artist: item.aiArtist,
              maker: item.aiMaker,
              period: item.aiPeriod,
              circa: item.aiCirca,
              medium: item.aiMedium,
              origin: item.aiOrigin,
              dimensions: item.aiDimensions,
              condition: (['mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is'].includes(item.aiCondition ?? '')
                ? (item.aiCondition as typeof lots.$inferInsert.condition)
                : null),
              conditionNotes: item.aiConditionNotes,
              status: 'approved',
              saleType: 'auction',
              estimateLow: item.finalEstimateLow ?? item.aiEstimateLow,
              estimateHigh: item.finalEstimateHigh ?? item.aiEstimateHigh,
              reservePrice: item.finalReserve ?? item.aiRecommendedReserve,
              startingBid: item.aiSuggestedStartingBid,
              sellerId,
              primaryImageUrl: stills[0] ?? null,
              imageCount: stills.length,
              slug,
              aiDescription: item.aiDescription,
              aiTags: item.aiTags,
              aiEstimateLow: item.aiEstimateLow,
              aiEstimateHigh: item.aiEstimateHigh,
              aiConfidenceScore: item.aiConfidence ? item.aiConfidence : null,
            })
            .returning();

          if (stills.length > 0) {
            await tx.insert(lotImages).values(
              stills.map((url, index) => ({
                lotId: lot.id,
                url,
                isPrimary: index === 0,
                sortOrder: index,
              })),
            );
          }

          // Assign to the sale one lot at a time so each insert's max+1
          // subselect sees the lot numbered just before it (same statement
          // the auction editor uses; the unique index arbitrates races).
          if (auctionId) {
            try {
              await tx.insert(auctionLots).values({
                auctionId,
                lotId: lot.id,
                lotNumber: sql`(select coalesce(max(${auctionLots.lotNumber}), 0) + 1 from ${auctionLots} where ${auctionLots.auctionId} = ${auctionId})`,
                closingAt: null,
              });
            } catch (err) {
              if (uniqueViolationConstraint(err) === 'auction_lots_auction_lot_number_unique_idx') {
                throw new LotNumberConflictError();
              }
              throw err;
            }
          }

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

        if (auctionId) {
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
        // and anyone who ever had it can keep injecting items into a closed
        // consignment.
        await tx
          .update(uploadLinks)
          .set({ status: 'completed' })
          .where(and(eq(uploadLinks.prospectId, prospectId), eq(uploadLinks.status, 'active')));

        // The consignment is now in the catalog: advance the funnel and
        // record the commission the lots were created under.
        await tx
          .update(sellerProspects)
          .set({
            status: 'accepted',
            ...(commissionPercent !== undefined ? { agreedCommissionPercent: commissionPercent } : {}),
            updatedAt: new Date(),
          })
          .where(eq(sellerProspects.id, prospectId));

        return { created, sellerId };
      });
    } catch (err) {
      if (err instanceof LotNumberConflictError) {
        return NextResponse.json(
          { error: 'Another admin assigned lots to this sale at the same time. Nothing was created — try again.' },
          { status: 409 },
        );
      }
      throw err;
    }

    const { created: createdLots, sellerId } = result;

    // Acceptance summary (count + estimate range) for the consignor. Same
    // guards as the portal email below: sentinel addresses are never emailed
    // and a send failure must not fail the request — the lots are committed.
    if (prospect.email && !isSentinelEmail(prospect.email)) {
      try {
        const totals = acceptedItems.reduce(
          (acc, item) => ({
            low: acc.low + (item.finalEstimateLow ?? item.aiEstimateLow ?? 0),
            high: acc.high + (item.finalEstimateHigh ?? item.aiEstimateHigh ?? 0),
          }),
          { low: 0, high: 0 },
        );
        await sendProspectAcceptedNotification({
          prospectEmail: prospect.email,
          prospectName: prospect.fullName,
          acceptedCount: createdLots.length,
          totalEstimateLow: totals.low,
          totalEstimateHigh: totals.high,
        });
      } catch (emailError) {
        logger.error('Failed to send prospect accepted email', emailError, { prospectId });
      }
    }

    // Send the consignor their tracking link. Best-effort: the lots are
    // committed either way, and phone/walk-in prospects (sentinel email) or a
    // Resend outage must not fail the admin's request.
    if (prospect.email && !isSentinelEmail(prospect.email)) {
      try {
        const [sellerRow] = await db
          .select({ portalToken: users.portalToken })
          .from(users)
          .where(eq(users.id, sellerId))
          .limit(1);
        if (sellerRow) {
          await sendConsignorPortalEmail({
            email: prospect.email,
            name: prospect.fullName,
            lotCount: createdLots.length,
            portalUrl: portalUrl(sellerRow.portalToken),
          });
        }
      } catch (emailError) {
        logger.error('Failed to send consignor portal email', emailError, { prospectId, sellerId });
      }
    }

    if (auctionSlug) revalidatePublicCatalog(auctionSlug);

    logger.info('Lots created from prospect items', {
      prospectId,
      lotsCreated: createdLots.length,
      auctionId: auctionId ?? null,
    });

    return NextResponse.json({
      lotsCreated: createdLots.length,
      lotIds: createdLots.map((c) => c.lotId),
      auctionId: auctionId ?? null,
    });
  } catch (error) {
    logger.error('Error creating lots from prospect items', error);
    return NextResponse.json(
      { error: 'Failed to create lots' },
      { status: 500 }
    );
  }
}
