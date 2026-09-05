import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctions, users } from '@/db/schema';
import { eq, sql, or } from 'drizzle-orm';
import { auctionUpdateSchema } from '@/lib/validation/schemas';
import { openAuctionLots } from '@/lib/bidding/lifecycle';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isPubliclyVisibleAuction, toPublicAuction } from '@/lib/auctions/visibility';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Accept a UUID or a slug (a non-UUID string compared against the uuid
    // column throws 22P02 in Postgres, so only match on id when it looks like one).
    const [auction] = await db
      .select()
      .from(auctions)
      .where(
        UUID_RE.test(auctionId)
          ? or(eq(auctions.id, auctionId), eq(auctions.slug, auctionId))
          : eq(auctions.slug, auctionId),
      )
      .limit(1);

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Only admins may see draft/cancelled auctions or internal fields
    // (livekitRoomName, createdById, auctioneerId). Everyone else gets the
    // same public projection as the list endpoint.
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [profile] = await db
          .select({ role: users.role, isAdmin: users.isAdmin })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        isAdmin = isAdminProfile(profile);
      }
    } catch {
      isAdmin = false;
    }

    const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
    if (isAdmin) {
      return NextResponse.json({ data: auction }, { headers: noStore });
    }
    if (!isPubliclyVisibleAuction(auction.status)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    return NextResponse.json({ data: toPublicAuction(auction) }, { headers: noStore });
  } catch (error) {
    logger.error('Get auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = auctionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Convert datetime strings to Date objects for timestamp columns
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: sql`now()` };
    if (typeof updateData.previewStartsAt === 'string') {
      updateData.previewStartsAt = new Date(updateData.previewStartsAt as string);
    }
    if (typeof updateData.biddingStartsAt === 'string') {
      updateData.biddingStartsAt = new Date(updateData.biddingStartsAt as string);
    }
    if (typeof updateData.biddingEndsAt === 'string') {
      updateData.biddingEndsAt = new Date(updateData.biddingEndsAt as string);
    }

    // A manual transition to 'open' must run the same lot-opening step the
    // lifecycle cron performs (lot status, per-lot closingAt, Redis bid state);
    // a bare status flip would leave every lot unbiddable. openAuctionLots is
    // idempotent, and runs BEFORE the status flip (mirroring the cron and the
    // live-start route) so a failure leaves the auction re-openable.
    const [existing] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const opensBidding =
      parsed.data.status === 'open' &&
      ['draft', 'scheduled', 'preview'].includes(existing.status);

    if (opensBidding) {
      const effective = {
        ...existing,
        biddingEndsAt: (updateData.biddingEndsAt as Date | undefined) ?? existing.biddingEndsAt,
      };
      // A timed auction with no end time can't be opened correctly
      // (openAuctionLots refuses it) — don't flip it to 'open' with
      // unbiddable lots.
      if (effective.type !== 'live' && !effective.biddingEndsAt) {
        return NextResponse.json(
          { error: 'Set a bidding end date before opening this auction.' },
          { status: 400 },
        );
      }
      await openAuctionLots(effective);
    }

    const [updated] = await db
      .update(auctions)
      .set(updateData as typeof auctions.$inferInsert)
      .where(eq(auctions.id, auctionId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    revalidatePublicCatalog(updated.slug);
    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    if (['open', 'live', 'closing'].includes(auction.status)) {
      return NextResponse.json(
        { error: `Cannot delete an auction that is ${auction.status}` },
        { status: 400 },
      );
    }

    await db.delete(auctions).where(eq(auctions.id, auctionId));
    revalidatePublicCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
