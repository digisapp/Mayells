import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { BIDDING_SALE_STATUSES, lastLotCloseSql, salePhase, takingBidsSql } from '../bidding-window';

const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) => new PgDialect().sqlToQuery(fragment);

describe('salePhase', () => {
  it('reads a sale as upcoming before bidding opens', () => {
    for (const s of ['draft', 'scheduled', 'preview']) {
      expect(salePhase(s, false)).toBe('upcoming');
    }
  });

  it('reads open and live sales as bidding', () => {
    expect(salePhase('open', false)).toBe('bidding');
    expect(salePhase('live', false)).toBe('bidding');
  });

  it("keeps a 'closed' sale bidding while its staggered lots are still open", () => {
    expect(salePhase('closed', true)).toBe('bidding');
    expect(salePhase('closed', false)).toBe('past');
  });

  it("reads 'closing' (ended early, every lot force-closed) as past", () => {
    expect(salePhase('closing', false)).toBe('past');
    expect(salePhase('closing', true)).toBe('past');
  });

  it('reads settled and cancelled sales as past', () => {
    expect(salePhase('completed', false)).toBe('past');
    expect(salePhase('cancelled', false)).toBe('past');
  });
});

describe('bidding window SQL', () => {
  it('matches the bid route: closed stays biddable, closing does not', () => {
    expect(BIDDING_SALE_STATUSES).toContain('closed');
    expect(BIDDING_SALE_STATUSES).not.toContain('closing');
  });

  // Unqualified outer columns inside a correlated subquery are ambiguous in
  // Postgres (auction_lots and lots both have "id" and "status").
  it('qualifies every outer reference to the auctions row', () => {
    for (const fragment of [takingBidsSql, lastLotCloseSql]) {
      const { sql } = render(fragment);
      expect(sql).toContain('al.auction_id = "auctions"."id"');
      expect(sql).toContain('coalesce(al.closing_at, "auctions"."bidding_ends_at")');
      expect(sql).toContain("l.status = 'in_auction'");
    }
    expect(render(takingBidsSql).sql).toContain('> now()');
  });
});
