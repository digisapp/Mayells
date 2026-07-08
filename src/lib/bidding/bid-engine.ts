import { db } from '@/db';
import { bids, lots, maxBids, auctionLots } from '@/db/schema';
import { eq, and, desc, ne, lt, sql } from 'drizzle-orm';
import { redis } from '@/lib/redis';
import { getMinIncrement, INCREMENT_TIERS } from './bid-increments';
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
  /** Lot's starting bid in cents. Enforced as the floor for the first bid. */
  startingBid?: number;
  antiSnipeSettings: {
    antiSnipeEnabled: boolean;
    antiSnipeMinutes: number;
    antiSnipeWindowMinutes: number;
  };
}

interface BidResult {
  success: boolean;
  error?: string;
  /** Minimum acceptable bid in cents, populated on BID_TOO_LOW. */
  minRequired?: number;
  bid?: typeof bids.$inferSelect;
  extended?: boolean;
  newCloseTime?: number;
  previousBidderId?: string;
}

interface BidScriptResult {
  ok: boolean;
  error?: string;
  minRequired?: number;
  previousBidderId?: string;
  previousAmount?: number;
}

/**
 * The Upstash SDK auto-deserializes JSON-looking values returned from
 * EVAL, so the Lua script's cjson.encode(...) string may arrive here as
 * either a string (raw) or an already-parsed object. Handle both.
 */
export function parseBidScriptResult(raw: unknown): BidScriptResult {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as BidScriptResult;
  }
  if (raw && typeof raw === 'object') {
    return raw as BidScriptResult;
  }
  throw new Error(`Unexpected bid script result: ${String(raw)}`);
}

// Lua script for atomic bid validation in Redis.
//
// Serialization convention: the current-bid state is stored as a single
// JSON-encoded object string ({amount, bidderId, timestamp}). On the
// Node side we hand the plain object to redis.set() and let the Upstash
// SDK serialize it exactly once; inside Lua we read it with cjson.decode
// and write it with cjson.encode — both sides agree on one level of JSON.
//
// KEYS[1] = current bid state, KEYS[2] = close time (unix seconds)
// ARGV[1] = bid amount (cents)
// ARGV[2] = bidder id
// ARGV[3] = now (unix seconds)
// ARGV[4] = JSON array of increment tiers [{threshold, increment}, ...]
// ARGV[5] = starting bid (cents) — floor for the first bid
const BID_LUA_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
local closeTimeRaw = redis.call('GET', KEYS[2])

-- Fail closed: if the lot's state was never initialized (or expired),
-- reject instead of bidding against a phantom $0 lot with no close check.
if (not currentJson) or (not closeTimeRaw) then
  return cjson.encode({ok=false, error='STATE_MISSING'})
end

local now = tonumber(ARGV[3])
local closeTime = tonumber(closeTimeRaw)

-- Half-open bidding window [start, close): a bid exactly at the close
-- timestamp is rejected (matches anti-snipe, which only extends when
-- bidTimestamp < closeTime).
if now >= closeTime then
  return cjson.encode({ok=false, error='AUCTION_CLOSED'})
end

local current = cjson.decode(currentJson)
local amount = tonumber(ARGV[1])

-- Cannot bid against yourself
if current.bidderId == ARGV[2] then
  return cjson.encode({ok=false, error='ALREADY_HIGH_BIDDER'})
end

-- The minimum increment is a function of the CURRENT bid amount (known
-- only here, atomically), not of the incoming bid amount.
local tiers = cjson.decode(ARGV[4])
local increment = tiers[1]['increment']
for i = 1, #tiers do
  if current.amount >= tiers[i]['threshold'] then
    increment = tiers[i]['increment']
  end
end

local minRequired
if current.amount == 0 then
  -- First bid: must meet the lot's starting bid (and at least one
  -- increment off zero).
  local startingBid = math.max(tonumber(ARGV[5]) or 0, tonumber(current.startingBid or 0))
  minRequired = math.max(startingBid, current.amount + increment)
else
  minRequired = current.amount + increment
end

if amount < minRequired then
  return cjson.encode({ok=false, error='BID_TOO_LOW', minRequired=minRequired})
end

-- Set new high bid atomically
local newBid = cjson.encode({
  amount=amount,
  bidderId=ARGV[2],
  timestamp=now,
  startingBid=current.startingBid or 0
})
redis.call('SET', KEYS[1], newBid)
redis.call('INCR', KEYS[1] .. ':bid_count')

return cjson.encode({ok=true, previousBidderId=current.bidderId, previousAmount=current.amount})
`;

// Compensating revert used when the Postgres write fails after Redis already
// accepted the bid. Restores the previous bid state ONLY if the current state
// is still exactly the bid we wrote (compare-and-set), so a concurrent higher
// bid that landed in the gap is never clobbered.
//
// KEYS[1] = current bid state
// ARGV[1] = our bid amount (cents), ARGV[2] = our bidder id
// ARGV[3] = JSON of the previous state to restore {amount, bidderId, timestamp}
const REVERT_BID_LUA_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
if not currentJson then return 0 end
local current = cjson.decode(currentJson)
if tostring(current.amount) == ARGV[1] and current.bidderId == ARGV[2] then
  local prev = cjson.decode(ARGV[3])
  prev.startingBid = current.startingBid or 0
  redis.call('SET', KEYS[1], cjson.encode(prev))
  redis.call('DECR', KEYS[1] .. ':bid_count')
  return 1
end
return 0
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
    startingBid = 0,
    antiSnipeSettings,
  } = input;

  const now = Math.floor(Date.now() / 1000);
  const currentBidKey = `bid:lot:${lotId}:current`;
  const closeTimeKey = `bid:lot:${lotId}:close_time`;

  // Step 0: True idempotency. If this exact request was already persisted
  // (client retry after a network timeout), return the original bid instead
  // of re-running the Redis eval — which would either raise the minimum for
  // everyone or return ALREADY_HIGH_BIDDER for a bid that actually succeeded.
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(bids)
      .where(eq(bids.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return { success: true, bid: existing };
    }
  }

  // Step 1: Atomic validation + set in Redis. The increment tier table is
  // shipped into the script so the minimum increment can be derived from
  // the current bid amount inside the atomic section.
  const redisResult = await redis.eval(
    BID_LUA_SCRIPT,
    [currentBidKey, closeTimeKey],
    [
      amount.toString(),
      bidderId,
      now.toString(),
      JSON.stringify(INCREMENT_TIERS),
      startingBid.toString(),
    ],
  );

  const parsed = parseBidScriptResult(redisResult);

  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.error,
      minRequired: parsed.minRequired,
    };
  }

  // Step 2: Persist to Postgres atomically — bid insert, outbid demotion,
  // and the denormalized lots update succeed or fail together. If the DB
  // write fails, Redis already holds this bid as the new high bid, which
  // would leave a phantom leader with no DB row. Compensate by rolling the
  // Redis state back to the previous bid — but only if nothing has bid on
  // top of us in the meantime (compare-and-set), so a concurrent higher bid
  // is never clobbered.
  let newBid: typeof bids.$inferSelect;
  try {
    newBid = await db.transaction(async (tx) => {
    const [insertedBid] = await tx.insert(bids).values({
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

    // Demote previous high bids to 'outbid'. Only demote lower bids so an
    // interleaved higher write is never demoted by a late lower one.
    await tx
      .update(bids)
      .set({ status: 'outbid' })
      .where(
        and(
          eq(bids.lotId, lotId),
          eq(bids.status, 'active'),
          ne(bids.id, insertedBid.id),
          lt(bids.amount, amount),
        ),
      );

    // Bid count always increments for an accepted bid.
    await tx
      .update(lots)
      .set({
        bidCount: sql`${lots.bidCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId));

    // Denormalized high-bid state only moves upward: a late-arriving lower
    // write cannot clobber a higher current bid.
    await tx
      .update(lots)
      .set({
        currentBidAmount: amount,
        currentBidderId: bidderId,
        updatedAt: new Date(),
      })
      .where(and(eq(lots.id, lotId), lt(lots.currentBidAmount, amount)));

    return insertedBid;
    });
  } catch (dbError) {
    // Best-effort compensation: revert Redis to the previous bid only if the
    // current state is still the one we just wrote. Uses previousBidderId /
    // previousAmount from the Lua result to reconstruct the prior state.
    await redis.eval(
      REVERT_BID_LUA_SCRIPT,
      [currentBidKey],
      [
        amount.toString(),
        bidderId,
        JSON.stringify({
          amount: parsed.previousAmount ?? 0,
          bidderId: parsed.previousBidderId ?? '',
          timestamp: now,
        }),
      ],
    ).catch(() => {
      // If the revert itself fails, the phantom persists until the lot
      // settles; the DB error below is the primary signal.
    });
    throw dbError;
  }

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
  await processMaxBids(lotId, auctionId, bidderId, amount, antiSnipeSettings, startingBid);

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
  startingBid = 0,
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
    const result = await placeBid({
      lotId,
      auctionId,
      bidderId: topMaxBid.bidderId,
      amount: proxyBidAmount,
      bidType: 'auto',
      startingBid,
      antiSnipeSettings,
    });

    // Only consume the proxy holder's max when the bid actually landed.
    // On failure (e.g. BID_TOO_LOW from a concurrent higher bid, or
    // AUCTION_CLOSED) leave the record active and untouched, and stop.
    if (!result.success) return;

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

// Initialize Redis state for a lot when auction opens.
//
// Serialization convention: pass the plain object to redis.set() — the
// Upstash SDK JSON-serializes it exactly once, which is what the Lua
// script's cjson.decode expects. Do NOT pre-stringify (the SDK would
// stringify again and Lua would decode to a string instead of a table).
//
// amount starts at 0 ("no bids yet"); the starting bid is enforced as the
// floor for the first bid inside the Lua script. It is also stored on the
// state object so the script can fall back to it if a caller omits it.
export async function initializeLotBidState(lotId: string, closeTime: Date, startingBid: number) {
  const currentBidKey = `bid:lot:${lotId}:current`;
  const closeTimeKey = `bid:lot:${lotId}:close_time`;

  await redis.set(currentBidKey, { amount: 0, bidderId: '', timestamp: 0, startingBid });
  await redis.set(closeTimeKey, Math.floor(closeTime.getTime() / 1000));
}
