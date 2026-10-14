import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each db.select() resolves to the next queued result set; each db.update()
// records its .set() payload and resolves .returning() to the next queued rows.
const selectQueue: unknown[][] = [];
const returningQueue: unknown[][] = [];
const updates: Record<string, unknown>[] = [];

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'innerJoin', 'where', 'orderBy']) c[m] = () => c;
  c.limit = () => Promise.resolve(rows);
  c.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return c;
}

function updateChain() {
  const c: Record<string, unknown> = {};
  c.set = (payload: Record<string, unknown>) => { updates.push(payload); return c; };
  c.where = () => c;
  c.returning = () => Promise.resolve(returningQueue.shift() ?? []);
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve);
  return c;
}

vi.mock('@/db', () => {
  const db = {
    select: vi.fn(() => chain(selectQueue.shift() ?? [])),
    update: vi.fn(() => updateChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db };
});

vi.mock('@/lib/redis', () => ({
  redis: { pipeline: vi.fn(() => ({ del: vi.fn(), set: vi.fn(), exec: vi.fn(async () => []) })) },
}));

vi.mock('../bid-engine', () => ({
  initializeLotBidStates: vi.fn(async () => {}),
  settlingKeyFor: (lotId: string) => `bid:lot:${lotId}:settling`,
}));

import { openAuctionLots, cancelAuction } from '../lifecycle';
import { initializeLotBidStates } from '../bid-engine';
import { db } from '@/db';
import type { Auction } from '@/db/schema';

const END = new Date('2026-10-20T20:00:00Z');
const NOW = new Date('2026-10-14T12:00:00Z');

const auction = (over: Partial<Auction> = {}) =>
  ({
    id: 'auction-1',
    type: 'timed',
    status: 'scheduled',
    biddingEndsAt: END,
    lotClosingIntervalSeconds: 30,
    liveauctioneersUrl: null,
    ...over,
  }) as Auction;

const row = (lotId: string, status: string, lotNumber: number) => ({
  auctionLot: { id: `al-${lotId}`, lotId, lotNumber },
  lot: { id: lotId, status, startingBid: 1000 },
});

beforeEach(() => {
  selectQueue.length = 0;
  returningQueue.length = 0;
  updates.length = 0;
  vi.clearAllMocks();
});

describe('openAuctionLots', () => {
  it('opens nothing for a LiveAuctioneers sale', async () => {
    const opened = await openAuctionLots(auction({ liveauctioneersUrl: 'https://www.liveauctioneers.com/catalog/1' }), NOW);
    expect(opened).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(initializeLotBidStates).not.toHaveBeenCalled();
  });

  it('makes only approved lots (and its own interrupted opens) biddable', async () => {
    selectQueue.push(
      [
        row('lot-approved', 'approved', 1),
        row('lot-draft', 'draft', 2),
        row('lot-sold', 'sold', 3),
        row('lot-reentry', 'in_auction', 4),
        row('lot-gallery', 'for_sale', 5),
      ],
      [], // no other bidding sale holds the re-entry lot
    );
    returningQueue.push([{ id: 'lot-approved' }]);

    const opened = await openAuctionLots(auction(), NOW);

    expect(opened).toBe(2);
    const seeded = vi.mocked(initializeLotBidStates).mock.calls[0][0];
    expect(seeded.map((e) => [e.lotId, e.fresh])).toEqual([
      ['lot-approved', true],
      ['lot-reentry', false],
    ]);
    // Close times keep each lot's catalogue position (lot 4 = index 3).
    expect(seeded[1].closeTime).toEqual(new Date(END.getTime() + 3 * 30_000));
  });

  it('leaves an in_auction lot alone when another bidding sale holds it', async () => {
    selectQueue.push([row('lot-elsewhere', 'in_auction', 1)], [{ lotId: 'lot-elsewhere' }]);
    returningQueue.push([]);

    expect(await openAuctionLots(auction(), NOW)).toBe(0);
    expect(vi.mocked(initializeLotBidStates).mock.calls[0][0]).toEqual([]);
  });
});

describe('cancelAuction', () => {
  it('releases only lots this sale holds, never sold lots or another sale\'s lot', async () => {
    selectQueue.push(
      [
        { lotId: 'lot-mine', status: 'approved' },
        { lotId: 'lot-opened', status: 'in_auction' },
        { lotId: 'lot-sold', status: 'sold' },
        { lotId: 'lot-shared', status: 'approved' },
      ],
      [{ lotId: 'lot-shared' }], // also in another unfinished sale
    );

    const result = await cancelAuction(auction({ status: 'scheduled' }), NOW);

    expect(result).toEqual({ ok: true, lotsReleased: 2 });
    // Lot reset, max-bid retire, close-time clear, sale cancel.
    expect(updates[0]).toMatchObject({ status: 'approved', currentBidAmount: 0, bidCount: 0 });
    expect(updates.at(-1)).toMatchObject({ status: 'cancelled' });
  });

  it('refuses a LiveAuctioneers sale that already has recorded sales', async () => {
    selectQueue.push([{ lotId: 'lot-sold', status: 'sold' }]);
    const result = await cancelAuction(
      auction({ status: 'scheduled', liveauctioneersUrl: 'https://www.liveauctioneers.com/catalog/1' }),
      NOW,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/LiveAuctioneers results/) });
    expect(db.update).not.toHaveBeenCalled();
  });
});
