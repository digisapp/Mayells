import { describe, it, expect } from 'vitest';
import {
  PUBLIC_AUCTION_STATUSES,
  isPubliclyVisibleAuction,
  toPublicAuction,
} from '../visibility';
import type { Auction } from '@/db/schema';

describe('auction visibility', () => {
  it('keeps draft and cancelled auctions internal', () => {
    expect(isPubliclyVisibleAuction('draft')).toBe(false);
    expect(isPubliclyVisibleAuction('cancelled')).toBe(false);
    expect(isPubliclyVisibleAuction(null)).toBe(false);
    expect(isPubliclyVisibleAuction(undefined)).toBe(false);
    expect(isPubliclyVisibleAuction('')).toBe(false);
  });

  it('exposes every announced lifecycle status', () => {
    for (const s of ['scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed']) {
      expect(isPubliclyVisibleAuction(s)).toBe(true);
      expect(PUBLIC_AUCTION_STATUSES).toContain(s);
    }
  });

  it('strips internal fields from the public projection', () => {
    const row = {
      id: 'a1',
      title: 'Spring Sale',
      slug: 'spring-sale',
      status: 'open',
      livekitRoomName: 'auction-a1-room',
      createdById: 'admin-1',
      auctioneerId: 'admin-2',
    } as unknown as Auction;

    const pub = toPublicAuction(row) as Record<string, unknown>;
    expect(pub).not.toHaveProperty('livekitRoomName');
    expect(pub).not.toHaveProperty('createdById');
    expect(pub).not.toHaveProperty('auctioneerId');
    expect(pub.title).toBe('Spring Sale');
    expect(pub.slug).toBe('spring-sale');
  });
});
