import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { desc, and, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { auctionSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { PUBLIC_AUCTION_STATUSES, toPublicAuction, type AuctionStatus } from '@/lib/auctions/visibility';
import { isAdminUser, requireAdminApi } from '@/lib/auth/require-admin';
import { isUniqueViolation, SLUG_IN_USE_ERROR } from '@/lib/auctions/db-errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // Only authenticated admins may list non-public auctions (draft plans,
    // cancelled sales) or see internal fields.
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      isAdmin = await isAdminUser(user?.id);
    } catch {
      isAdmin = false;
    }

    const conditions = [];
    if (status) {
      const validStatuses = auctions.status.enumValues as readonly string[];
      const requested = status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => validStatuses.includes(s)) as AuctionStatus[];
      const allowed = isAdmin
        ? requested
        : requested.filter((s) => (PUBLIC_AUCTION_STATUSES as readonly string[]).includes(s));
      conditions.push(inArray(auctions.status, allowed.length > 0 ? allowed : [...PUBLIC_AUCTION_STATUSES]));
    } else if (!isAdmin) {
      conditions.push(inArray(auctions.status, [...PUBLIC_AUCTION_STATUSES]));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select()
      .from(auctions)
      .where(where)
      .orderBy(desc(auctions.biddingStartsAt))
      .limit(200);

    return NextResponse.json({ data: isAdmin ? result : result.map(toPublicAuction) });
  } catch (error) {
    logger.error('Auctions list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;

    const body = await req.json();
    const parsed = auctionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { previewStartsAt, biddingStartsAt, biddingEndsAt, ...rest } = parsed.data;
    let auction: typeof auctions.$inferSelect;
    try {
      [auction] = await db.insert(auctions).values({
        ...rest,
        previewStartsAt: previewStartsAt ? new Date(previewStartsAt) : undefined,
        biddingStartsAt: biddingStartsAt ? new Date(biddingStartsAt) : undefined,
        biddingEndsAt: biddingEndsAt ? new Date(biddingEndsAt) : undefined,
        createdById: admin.id,
      }).returning();
    } catch (err) {
      // auctions.slug is unique; the form derives it from the title, so a
      // second "Spring Sale" collides. Tell the operator instead of 500ing.
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: SLUG_IN_USE_ERROR }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ data: auction }, { status: 201 });
  } catch (error) {
    logger.error('Create auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
