import { describe, expect, it } from 'vitest';
import { biddingVenue, isOnSiteBiddingSale, liveAuctioneersSaleStep } from '../venue';

describe('biddingVenue', () => {
  it('sends a sale with a LiveAuctioneers link there', () => {
    expect(biddingVenue({ liveauctioneersUrl: 'https://www.liveauctioneers.com/catalog/1' })).toBe('liveauctioneers');
    expect(isOnSiteBiddingSale({ liveauctioneersUrl: 'https://www.liveauctioneers.com/catalog/1' })).toBe(false);
  });

  it('bids every other sale on mayells.com', () => {
    expect(biddingVenue({ liveauctioneersUrl: null })).toBe('mayells');
    expect(biddingVenue({ liveauctioneersUrl: '  ' })).toBe('mayells');
    expect(isOnSiteBiddingSale({})).toBe(true);
  });
});

describe('liveAuctioneersSaleStep', () => {
  const now = new Date('2026-10-14T18:00:00Z');
  const before = new Date('2026-10-14T17:00:00Z');
  const after = new Date('2026-10-14T19:00:00Z');
  const sale = (status: string, biddingStartsAt: Date | null, biddingEndsAt: Date | null) => ({
    status,
    biddingStartsAt,
    biddingEndsAt,
  });

  it('shows the sale as open once its start time passes', () => {
    expect(liveAuctioneersSaleStep(sale('scheduled', before, after), now)).toBe('open');
    expect(liveAuctioneersSaleStep(sale('preview', before, null), now)).toBe('open');
    expect(liveAuctioneersSaleStep(sale('scheduled', after, null), now)).toBeNull();
    expect(liveAuctioneersSaleStep(sale('scheduled', null, null), now)).toBeNull();
  });

  it('ends the sale once its close time passes, or when it was ended early', () => {
    expect(liveAuctioneersSaleStep(sale('open', before, before), now)).toBe('close');
    expect(liveAuctioneersSaleStep(sale('live', before, now), now)).toBe('close');
    expect(liveAuctioneersSaleStep(sale('closing', before, after), now)).toBe('close');
  });

  it('keeps a sale with no close time, or one still running, open', () => {
    expect(liveAuctioneersSaleStep(sale('open', before, null), now)).toBeNull();
    expect(liveAuctioneersSaleStep(sale('open', before, after), now)).toBeNull();
  });

  it('never touches a draft, a sale awaiting results, or a finished sale', () => {
    for (const status of ['draft', 'closed', 'completed', 'cancelled']) {
      expect(liveAuctioneersSaleStep(sale(status, before, before), now)).toBeNull();
    }
  });
});
