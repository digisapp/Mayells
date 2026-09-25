import { describe, it, expect } from 'vitest';
import { lotPhase, pickCurrentLot, lotRef, type LiveLot } from '../live-lots';
import { fullscreenStrategy, isStageFullscreen } from '../fullscreen';

const NOW = Date.parse('2026-09-25T18:00:00Z');

function lot(overrides: Partial<LiveLot>): LiveLot {
  return {
    id: 'id',
    slug: null,
    lotNumber: 1,
    title: 'Lot',
    imageUrl: null,
    currentBidAmount: 0,
    bidCount: 0,
    estimateLow: null,
    estimateHigh: null,
    minNextBid: 1000,
    phase: 'open',
    closingAt: null,
    isHighBidder: false,
    ...overrides,
  };
}

describe('lotPhase', () => {
  it('is open only while an in-auction lot closes in the future', () => {
    expect(lotPhase('in_auction', new Date(NOW + 60_000), NOW)).toBe('open');
    expect(lotPhase('in_auction', new Date(NOW - 1), NOW)).toBe('closed');
    expect(lotPhase('in_auction', null, NOW)).toBe('closed');
  });

  it('maps settled and not-yet-opened lots', () => {
    expect(lotPhase('sold', null, NOW)).toBe('sold');
    expect(lotPhase('unsold', null, NOW)).toBe('passed');
    expect(lotPhase('approved', null, NOW)).toBe('upcoming');
  });
});

describe('pickCurrentLot', () => {
  it('follows the open lot that closes soonest', () => {
    const lots = [
      lot({ id: 'a', lotNumber: 1, phase: 'sold' }),
      lot({ id: 'b', lotNumber: 2, closingAt: '2026-09-25T18:05:00Z' }),
      lot({ id: 'c', lotNumber: 3, closingAt: '2026-09-25T18:02:00Z' }),
    ];
    expect(pickCurrentLot(lots)?.id).toBe('c');
  });

  it('breaks close-time ties by lot number', () => {
    const at = '2026-09-25T18:05:00Z';
    const lots = [lot({ id: 'b', lotNumber: 7, closingAt: at }), lot({ id: 'a', lotNumber: 4, closingAt: at })];
    expect(pickCurrentLot(lots)?.id).toBe('a');
  });

  it('falls back to the first lot when nothing is open, and to nothing for an empty sale', () => {
    expect(pickCurrentLot([lot({ id: 'x', phase: 'sold' }), lot({ id: 'y', phase: 'passed' })])?.id).toBe('x');
    expect(pickCurrentLot([])).toBeUndefined();
  });
});

describe('lotRef', () => {
  it('prefers the slug', () => {
    expect(lotRef({ id: 'uuid', slug: 'a-vase' })).toBe('a-vase');
    expect(lotRef({ id: 'uuid', slug: null })).toBe('uuid');
  });
});

describe('fullscreenStrategy', () => {
  const stage = { requestFullscreen: async () => {}, webkitRequestFullscreen: () => {} };
  const video = { webkitEnterFullscreen: () => {} };

  it('uses the standard API on the stage where it is enabled', () => {
    expect(fullscreenStrategy({ fullscreenEnabled: true }, stage, video)).toBe('element');
  });

  it('falls back to the prefixed API (older iPadOS)', () => {
    expect(fullscreenStrategy({ webkitFullscreenEnabled: true }, stage, video)).toBe('webkit-element');
  });

  it("uses the video's native player on iPhone, where element fullscreen is unavailable", () => {
    expect(fullscreenStrategy({ fullscreenEnabled: false }, stage, video)).toBe('video');
  });

  it('reports no option when nothing is supported', () => {
    expect(fullscreenStrategy({}, stage, null)).toBeNull();
    expect(fullscreenStrategy({}, stage, {})).toBeNull();
  });

  it('knows when the stage itself is fullscreen', () => {
    const el = {} as Element;
    expect(isStageFullscreen({ fullscreenElement: el }, el)).toBe(true);
    expect(isStageFullscreen({ webkitFullscreenElement: el }, el)).toBe(true);
    expect(isStageFullscreen({ fullscreenElement: null }, el)).toBe(false);
  });
});
