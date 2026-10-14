import { describe, it, expect } from 'vitest';
import { clearedDateRefusal } from '../schedule-rules';

describe('clearedDateRefusal', () => {
  it('lets a draft clear any date', () => {
    for (const type of ['timed', 'live']) {
      expect(clearedDateRefusal({ status: 'draft', type }, 'biddingStartsAt')).toBeNull();
      expect(clearedDateRefusal({ status: 'draft', type }, 'biddingEndsAt')).toBeNull();
    }
  });

  it('never requires the preview date', () => {
    for (const status of ['scheduled', 'open', 'closed']) {
      expect(clearedDateRefusal({ status, type: 'timed' }, 'previewStartsAt')).toBeNull();
    }
  });

  it('keeps a scheduled timed sale on its start and close times', () => {
    expect(clearedDateRefusal({ status: 'scheduled', type: 'timed' }, 'biddingStartsAt')).toMatch(/needs a bidding start time.*back to draft/);
    expect(clearedDateRefusal({ status: 'preview', type: 'timed' }, 'biddingEndsAt')).toMatch(/needs a bidding close time/);
  });

  it('keeps every open sale on its close time, and a timed one on its start', () => {
    expect(clearedDateRefusal({ status: 'open', type: 'timed' }, 'biddingEndsAt')).toMatch(/Set a new close time instead/);
    expect(clearedDateRefusal({ status: 'live', type: 'live' }, 'biddingEndsAt')).toMatch(/can't be cleared/);
    expect(clearedDateRefusal({ status: 'closed', type: 'timed' }, 'biddingStartsAt')).toMatch(/can't be cleared/);
  });

  it('lets a live sale run without a close time until bidding opens', () => {
    expect(clearedDateRefusal({ status: 'scheduled', type: 'live' }, 'biddingEndsAt')).toBeNull();
    expect(clearedDateRefusal({ status: 'preview', type: 'live' }, 'biddingStartsAt')).toBeNull();
    expect(clearedDateRefusal({ status: 'open', type: 'live' }, 'biddingStartsAt')).toBeNull();
  });

  it('leaves finished sales alone', () => {
    for (const status of ['completed', 'cancelled']) {
      expect(clearedDateRefusal({ status, type: 'timed' }, 'biddingEndsAt')).toBeNull();
    }
  });
});
