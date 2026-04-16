import { db } from '@/db';
import { bids, lots, maxBids, auctionLots } from '@/db/schema';
import { eq, and, desc, ne, sql } from 'drizzle-orm';
import { redis } from '@/lib/redis';
import { getMinIncrement } from './bid-increments';
import { checkAndExtendAuction } from './anti-snipe';
import { track } from '@vercel/analytics/server';

interface PlaceBidInput {
  lotId: string;
  auctionId: string;
  bidderId: string;
  amount: number;
  maxBidAmount?: number;
  bidType?: 'manual' | 'auto' | 'phone' | 'auctioneer';
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
  antiSnipeSettings: {
    antiSnipeEnabled: boolean;
    antiSnipeMinutes: number;
    antiSnipeWindowMinutes: number;
  };
}

interface BidResult {
  success: boolean;
  error?: string;
  bid?: typeof bids.$inferSelect;
  extended?: boolean;
  newCloseTime?: number;
  previousBidderId?: string;
}

// Lua script for atomic bid validation in Redis
const BID_LUA_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
local closeTime = redis.call('GET', KEYS[2])
local now = tonumber(ARGV[3])

-- Check auction still open
if closeTime and now > tonumber(closeTime) then
  return cjson.encode({ok=false, error='AUCTION_CLOSED'})
end

local current = currentJson and cjson.decode(currentJson) or {amount=0, bidderId=''}

-- Cannot bid against yourself
if current.bidderId == ARGV[2] then
  return cjson.encode({ok=false, error='ALREADY_HIGH_BIDDER'})
end

-- Validate minimum increment
local minRequired = current.amount + tonumber(ARGV[4])
if tonumber(ARGV[1]) < minRequired then
  return cjson.encode({ok=false, error='BID_TOO_LOW', minRequired=minRequired})
end

-- Set new high bid atomically
local newBid = cjson.encode({
  amount=tonumber(ARGV[1]),
  bidderId=ARGV[2],
  timestamp=now
})
redis.call('SET', KEYS[1], newBid)
redis.call('INCR', KEYS[1] .. ':bid_count')

return cjson.encode({ok=true, previousBidderId=current.bidderId, previousAmount=current.amount})
`;

export async function placeBid(input: PlaceBidInput): Promise<BidResult> {
  const {
    lotId,
    auctionId,
    bidderId,
    amount,
    maxBidAmount,
    bidType = 'manual',
    idempotencyKey,
    ipAddress,
    userAgent,
    antiSnipeSettings,
  } = input;

  const now = Math.floor(Date.now() / 1000);
  const currentBidKey = `bid:lot:${lotId}:current`;
  const closeTimeKey = `bid:lot:${lotId}:close_time`;
  const minIncrement = getMinIncrement(amount);

  // Step 1: Atomic validation + set in Redis
  const redisResult = await redis.eval(
    BID_LUA_SCRIPT,
    [currentBidKey, closeTimeKey],
    [amount.toString(), bidderId, now.toString(), minIncrement.toString()],
  ) as string;

  const parsed = JSON.parse(redisResult as string);

  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.error,
    };
  }

  // Step 2: Persist to Postgres
  const [newBid] = await db.insert(bids).values({
    auctionId,
    lotId,
    bidderId,
    amount,
    maxBidAmount,
    bidType,
    status: 'active',
    idempotencyKey,
    ipAddress,
    userAgent,
  }).returning();

  // Update previous high bid to 'outbid'
  if (parsed.previousBidderId && parsed.previousBidderId !== '') {
    await db
      .update(bids)
      .set({ status: 'outbid' })
      .where(
        and(
          eq(bids.lotId, lotId),
          eq(bids.status, 'active'),
          ne(bids.id, newBid.id),
        ),
      );
  }

  // Update denormalized lot state
  await db
    .update(lots)
    .set({
      currentBidAmount: amount,
      currentBidderId: bidderId,
      bidCount: sql`${lots.bidCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(lots.id, lotId));

  // Step 3: Anti-snipe check
  const antiSnipeResult = await checkAndExtendAuction(
    lotId,
    now,
    antiSnipeSettings,
  );

  // Update Postgres closing time if extended
  if (antiSnipeResult.extended && antiSnipeResult.newCloseTime) {
    await db
      .update(auctionLots)
      .set({ closingAt: new Date(antiSnipeResult.newCloseTime * 1000) })
      .where(eq(auctionLots.lotId, lotId));

    // Mark bid as having triggered extension
    await db
      .update(bids)
      .set({ triggeredExtension: true })
      .where(eq(bids.id, newBid.id));
  }

  // Step 4: Process max bids (proxy bidding)
  await processMaxBids(lotId, auctionId, bidderId, amount, antiSnipeSettings);

  void track('bid_placed', {
    lotId,
    auctionId,
    bidType,
    amount: amount / 100,
    extended: antiSnipeResult.extended ?? false,
  });

  return {
    success: true,
    bid: newBid,
    extended: antiSnipeResult.extended,
    newCloseTime: antiSnipeResult.newCloseTime,
    previousBidderId: parsed.previousBidderId || undefined,
  };
}

async function processMaxBids(
  lotId: string,
  auctionId: string,
  currentBidderId: string,
  currentAmount: number,
  antiSnipeSettings: PlaceBidInput['antiSnipeSettings'],
) {
  // Find active max bids from OTHER users that exceed the current bid
  const activeMaxBids = await db
    .select()
    .from(maxBids)
    .where(
      and(
        eq(maxBids.lotId, lotId),
        eq(maxBids.isActive, true),
        ne(maxBids.bidderId, currentBidderId),
      ),
    )
    .orderBy(desc(maxBids.maxAmount))
    .limit(1);

  if (activeMaxBids.length === 0) return;

  const topMaxBid = activeMaxBids[0];
  const nextIncrement = getMinIncrement(currentAmount);
  const proxyBidAmount = Math.min(
    currentAmount + nextIncrement,
    topMaxBid.maxAmount,
  );

  if (proxyBidAmount > currentAmount) {
    // Place automatic bid on behalf of max-bid holder
    await placeBid({
      lotId,
      auctionId,
      bidderId: topMaxBid.bidderId,
      amount: proxyBidAmount,
      bidType: 'auto',
      antiSnipeSettings,
    });

    // Update the max bid record
    await db
      .update(maxBids)
      .set({
        currentProxyBid: proxyBidAmount,
        isActive: proxyBidAmount < topMaxBid.maxAmount,
        updatedAt: new Date(),
      })
      .where(eq(maxBids.id, topMaxBid.id));
  }
}

// Initialize Redis state for a lot when auction opens
export async function initializeLotBidState(lotId: string, closeTime: Date, startingBid: number) {
  const currentBidKey = `bid:lot:${lotId}:current`;
  const closeTimeKey = `bid:lot:${lotId}:close_time`;

  await redis.set(currentBidKey, JSON.stringify({ amount: startingBid, bidderId: '', timestamp: 0 }));
  await redis.set(closeTimeKey, Math.floor(closeTime.getTime() / 1000));
}
