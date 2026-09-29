import { describe, expect, it } from 'vitest';
import { biddingVenue, isOnSiteBiddingSale } from '../venue';

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
