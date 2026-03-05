import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctions, users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { auctionUpdateSchema } from '@/lib/validation/schemas';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Try by ID first, then by slug
    let [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionId))
      .limit(1);

    if (!auction) {
      [auction] = await db
        .select()
        .from(auctions)
        .where(eq(auctions.slug, auctionId))
        .limit(1);
    }

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    return NextResponse.json({ data: auction });
  } catch (error) {
    console.error('Get auction error:', error);
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
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;
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

    const [updated] = await db
      .update(auctions)
      .set(updateData as typeof auctions.$inferInsert)
      .where(eq(auctions.id, auctionId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Update auction error:', error);
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
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { auctionId } = await params;

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
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete auction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
