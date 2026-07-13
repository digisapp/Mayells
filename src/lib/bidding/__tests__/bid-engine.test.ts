import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@vercel/analytics/server', () => ({
  track: vi.fn(),
}));

vi.mock('../anti-snipe', () => ({
  checkAndExtendAuction: vi.fn(),
}));

// Proxy auto-bids are verification-gated; keep the gate permissive here so the
// proxy-resolution tests exercise the bidding logic, not the KYC lookup (which
// has its own dedicated tests in verification.test.ts).
vi.mock('../verification', () => ({
  getBidderVerification: vi.fn(async () => ({
    tier: 'identity',
    cardVerified: true,
    identityVerified: true,
    maxBidAllowed: Number.MAX_SAFE_INTEGER,
  })),
  checkBidAllowed: vi.fn(() => ({ allowed: true })),
}));

import { placeBid, initializeLotBidState, parseBidScriptResult, sealLotForSettlement, settlingKeyFor } from '../bid-engine';
import { INCREMENT_TIERS } from '../bid-increments';
import { checkAndExtendAuction } from '../anti-snipe';
import { redis } from '@/lib/redis';
import { db } from '@/db';
import { maxBids } from '@/db/schema';

const mockedRedis = vi.mocked(redis);
const mockedDb = vi.mocked(db);
const mockedAntiSnipe = vi.mocked(checkAndExtendAuction);

const baseSettings = {
  antiSnipeEnabled: true,
  antiSnipeMinutes: 2,
  antiSnipeWindowMinutes: 5,
};

const baseInput = {
  lotId: 'lot-1',
  auctionId: 'auction-1',
  bidderId: 'bidder-1',
  amount: 10_500,
  startingBid: 1_000,
  antiSnipeSettings: baseSettings,
};

const fakeBid = { id: 'bid-row-1', lotId: 'lot-1', amount: 10_500 };

// Builds a transaction mock whose insert returns `bid` and tracks updates.
function makeTx(bid: unknown = fakeBid) {
  const whereSpy = vi.fn(async () => undefined);
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => [bid]) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: whereSpy })) })),
  };
}

// Builds a select chain resolving to `rows` (used by processMaxBids).
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAntiSnipe.mockResolvedValue({ extended: false });
  // Default: no competing max bids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedDb.select.mockImplementation(() => makeSelectChain([]) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedDb.transaction.mockImplementation(async (cb: any) => cb(makeTx()));
});

describe('parseBidScriptResult', () => {
  it('parses a raw JSON string (Lua return before SDK deserialization)', () => {
    const result = parseBidScriptResult('{"ok":false,"error":"BID_TOO_LOW","minRequired":11000}');
    expect(result).toEqual({ ok: false, error: 'BID_TOO_LOW', minRequired: 11000 });
  });

  it('accepts an already-deserialized object (Upstash SDK auto-parse)', () => {
    const raw = { ok: true, previousBidderId: 'x', previousAmount: 9500 };
    expect(parseBidScriptResult(raw)).toBe(raw);
  });

  it('throws on unexpected primitives', () => {
    expect(() => parseBidScriptResult(null)).toThrow();
    expect(() => parseBidScriptResult(42)).toThrow();
  });
});

describe('placeBid – Redis validation', () => {
  it('fails with STATE_MISSING when Redis state was never initialized, without touching Postgres', async () => {
    // Upstash auto-deserializes the Lua JSON return into an object
    mockedRedis.eval.mockResolvedValue({ ok: false, error: 'STATE_MISSING' });

    const result = await placeBid(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE_MISSING');
    expect(mockedDb.transaction).not.toHaveBeenCalled();
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedAntiSnipe).not.toHaveBeenCalled();
  });

  it('also handles the eval result arriving as a raw JSON string', async () => {
    mockedRedis.eval.mockResolvedValue('{"ok":false,"error":"AUCTION_CLOSED"}');

    const result = await placeBid(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe('AUCTION_CLOSED');
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('surfaces minRequired on BID_TOO_LOW', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: false, error: 'BID_TOO_LOW', minRequired: 11_000 });

    const result = await placeBid(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe('BID_TOO_LOW');
    expect(result.minRequired).toBe(11_000);
  });

  it('passes the increment tier table and startingBid as script ARGVs', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: false, error: 'AUCTION_CLOSED' });

    await placeBid({ ...baseInput, startingBid: 5_000 });

    expect(mockedRedis.eval).toHaveBeenCalledTimes(1);
    const [script, keys, args] = mockedRedis.eval.mock.calls[0];
    expect(script).toContain('STATE_MISSING');
    expect(keys).toEqual(['bid:lot:lot-1:current', 'bid:lot:lot-1:close_time', 'bid:lot:lot-1:settling']);
    expect(args[0]).toBe('10500'); // amount
    expect(args[1]).toBe('bidder-1'); // bidder
    expect(args[3]).toBe(JSON.stringify(INCREMENT_TIERS)); // tier table
    expect(args[4]).toBe('5000'); // starting bid floor
  });

  it('rejects at exactly the close time (half-open window) in the Lua script', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: false, error: 'AUCTION_CLOSED' });
    await placeBid(baseInput);
    const [script] = mockedRedis.eval.mock.calls[0];
    expect(script).toContain('now >= closeTime');
  });

  it('bid Lua rejects when the settlement seal is present', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: false, error: 'AUCTION_CLOSED' });
    await placeBid(baseInput);
    const [script] = mockedRedis.eval.mock.calls[0];
    // The fence check reads KEYS[3] (the settling key) and bails first.
    expect(script).toContain("redis.call('GET', KEYS[3])");
  });
});

describe('sealLotForSettlement – settlement fence', () => {
  it('defers settlement when Redis close time is still in the future (live extension)', async () => {
    mockedRedis.get.mockResolvedValue(2_000); // close time
    const ready = await sealLotForSettlement('lot-1', 1_500); // now < close
    expect(ready).toBe(false);
    expect(mockedRedis.set).not.toHaveBeenCalledWith(settlingKeyFor('lot-1'), expect.anything(), expect.anything());
  });

  it('seals and reports ready when the close time has passed', async () => {
    mockedRedis.get.mockResolvedValue(1_000);
    const ready = await sealLotForSettlement('lot-1', 1_500); // now >= close
    expect(ready).toBe(true);
    expect(mockedRedis.set).toHaveBeenCalledWith('bid:lot:lot-1:settling', 1, { ex: 600 });
  });

  it('treats missing Redis state as ready (nothing to fence)', async () => {
    mockedRedis.get.mockResolvedValue(null);
    const ready = await sealLotForSettlement('lot-1', 1_500);
    expect(ready).toBe(true);
  });
});

describe('placeBid – success path', () => {
  it('writes the bid inside a transaction and returns the inserted row', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: true, previousBidderId: '', previousAmount: 0 });

    const result = await placeBid(baseInput);

    expect(result.success).toBe(true);
    expect(result.bid).toEqual(fakeBid);
    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    // Insert + updates happen on the tx, not the root db handle
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedAntiSnipe).toHaveBeenCalledWith('lot-1', expect.any(Number), baseSettings);
  });

  it('returns extension info when anti-snipe extends', async () => {
    mockedRedis.eval.mockResolvedValue({ ok: true, previousBidderId: 'prev', previousAmount: 9_500 });
    mockedAntiSnipe.mockResolvedValue({ extended: true, newCloseTime: 1_999 });
    // db.update used for auctionLots closingAt + triggeredExtension flag
    const whereSpy = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedDb.update.mockImplementation(() => ({ set: vi.fn(() => ({ where: whereSpy })) }) as any);

    const result = await placeBid(baseInput);

    expect(result.success).toBe(true);
    expect(result.extended).toBe(true);
    expect(result.newCloseTime).toBe(1_999);
    expect(result.previousBidderId).toBe('prev');
  });
});

describe('placeBid – proxy (max bid) processing', () => {
  const maxBidRow = {
    id: 'max-1',
    lotId: 'lot-1',
    bidderId: 'proxy-holder',
    maxAmount: 20_000,
    currentProxyBid: null,
    isActive: true,
  };

  it('does NOT consume the max bid when the proxy bid fails', async () => {
    // First eval: manual bid accepted. Second eval: proxy bid rejected.
    mockedRedis.eval
      .mockResolvedValueOnce({ ok: true, previousBidderId: '', previousAmount: 0 })
      .mockResolvedValueOnce({ ok: false, error: 'BID_TOO_LOW', minRequired: 13_000 });
    mockedDb.select
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(() => makeSelectChain([maxBidRow]) as any);

    const result = await placeBid(baseInput);

    expect(result.success).toBe(true);
    // The maxBids record must not be updated (no burned max, stays active)
    expect(mockedDb.update).not.toHaveBeenCalledWith(maxBids);
  });

  it('consumes the max bid only when the proxy bid succeeds', async () => {
    mockedRedis.eval
      .mockResolvedValueOnce({ ok: true, previousBidderId: '', previousAmount: 0 })
      .mockResolvedValueOnce({ ok: true, previousBidderId: 'bidder-1', previousAmount: 10_500 });
    mockedDb.select
      // outer processMaxBids: one competing max bid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(() => makeSelectChain([maxBidRow]) as any)
      // inner (recursive) processMaxBids: none, stop recursion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(() => makeSelectChain([]) as any);

    const setSpy = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedDb.update.mockImplementation(() => ({ set: setSpy }) as any);

    const result = await placeBid(baseInput);

    expect(result.success).toBe(true);
    expect(mockedDb.update).toHaveBeenCalledWith(maxBids);
    // currentAmount 10_500 -> $25 tier -> proxy = min(13_000, 20_000)
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProxyBid: 13_000,
        isActive: true, // 13_000 < maxAmount 20_000, max not exhausted
      }),
    );
  });
});

describe('initializeLotBidState', () => {
  it('stores the current-bid state as a plain object (single JSON encoding by the SDK)', async () => {
    const closeTime = new Date('2026-06-11T17:00:00Z');

    await initializeLotBidState('lot-1', closeTime, 5_000);

    expect(mockedRedis.set).toHaveBeenCalledWith(
      'bid:lot:lot-1:current',
      { amount: 0, bidderId: '', timestamp: 0, startingBid: 5_000 },
      { nx: true },
    );
    // NOT a pre-stringified value (that would get double-encoded by Upstash)
    const [, storedValue] = mockedRedis.set.mock.calls[0];
    expect(typeof storedValue).toBe('object');
  });

  it('stores the close time as unix seconds', async () => {
    const closeTime = new Date(1_750_000_000_000); // ms

    await initializeLotBidState('lot-1', closeTime, 1_000);

    expect(mockedRedis.set).toHaveBeenCalledWith('bid:lot:lot-1:close_time', 1_750_000_000, { nx: true });
  });

  it('starts amount at 0 so the Lua script enforces the starting-bid floor on the first bid', async () => {
    await initializeLotBidState('lot-1', new Date(), 25_000);
    const [, storedValue] = mockedRedis.set.mock.calls[0];
    expect((storedValue as { amount: number }).amount).toBe(0);
  });
});
