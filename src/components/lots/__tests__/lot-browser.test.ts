import { describe, it, expect } from 'vitest';
import {
  applyBrowse,
  browseQuery,
  deriveDepartments,
  parseBrowseState,
  type BrowseLot,
} from '../lot-browser';

function lot(id: string, overrides: Partial<BrowseLot> = {}): BrowseLot {
  return {
    id,
    slug: id,
    title: id,
    artist: null,
    lotNumber: null,
    primaryImageUrl: null,
    isFeatured: false,
    saleType: 'auction',
    status: 'in_auction',
    buyNowPrice: null,
    estimateLow: null,
    estimateHigh: null,
    currentBidAmount: 0,
    bidCount: 0,
    auctionSlug: null,
    categoryName: 'Fine Art',
    categorySlug: 'art',
    categorySortOrder: 1,
    createdAtMs: 0,
    closesAtMs: null,
    ...overrides,
  };
}

const ids = (lots: BrowseLot[]) => lots.map((l) => l.id);

describe('deriveDepartments', () => {
  it('counts lots per category and orders by the category sort order', () => {
    const depts = deriveDepartments([
      lot('a', { categorySlug: 'jewelry', categoryName: 'Jewelry', categorySortOrder: 3 }),
      lot('b', { categorySlug: 'art', categoryName: 'Fine Art', categorySortOrder: 1 }),
      lot('c', { categorySlug: 'jewelry', categoryName: 'Jewelry', categorySortOrder: 3 }),
    ]);
    expect(depts).toEqual([
      { slug: 'art', name: 'Fine Art', count: 1 },
      { slug: 'jewelry', name: 'Jewelry', count: 2 },
    ]);
  });

  it('breaks sort-order ties alphabetically', () => {
    const depts = deriveDepartments([
      lot('a', { categorySlug: 'watches', categoryName: 'Watches', categorySortOrder: 0 }),
      lot('b', { categorySlug: 'design', categoryName: 'Design', categorySortOrder: 0 }),
    ]);
    expect(depts.map((d) => d.slug)).toEqual(['design', 'watches']);
  });
});

describe('parseBrowseState / browseQuery', () => {
  it('defaults to every department, newest first', () => {
    expect(parseBrowseState('')).toEqual({ dept: null, sort: 'newest' });
  });

  it('reads dept and a known sort', () => {
    expect(parseBrowseState('?dept=jewelry&sort=closing')).toEqual({ dept: 'jewelry', sort: 'closing' });
  });

  it('ignores an unknown sort and a blank dept', () => {
    expect(parseBrowseState('?dept=&sort=cheapest')).toEqual({ dept: null, sort: 'newest' });
  });

  it('omits defaults so the plain view keeps a clean URL', () => {
    expect(browseQuery({ dept: null, sort: 'newest' })).toBe('');
    expect(browseQuery({ dept: 'art', sort: 'newest' })).toBe('?dept=art');
    expect(browseQuery({ dept: null, sort: 'estimate-asc' })).toBe('?sort=estimate-asc');
  });

  it('keeps unrelated params and drops cleared ones', () => {
    expect(browseQuery({ dept: null, sort: 'newest' }, '?utm_source=x&dept=art&sort=closing')).toBe('?utm_source=x');
    expect(browseQuery({ dept: 'art', sort: 'closing' }, '?utm_source=x')).toBe('?utm_source=x&dept=art&sort=closing');
  });

  it('round-trips', () => {
    const state = { dept: 'fashion', sort: 'estimate-desc' as const };
    expect(parseBrowseState(browseQuery(state))).toEqual(state);
  });
});

describe('applyBrowse', () => {
  const rows = [
    lot('old-art', { createdAtMs: 1, estimateLow: 100, estimateHigh: 200, closesAtMs: 3000 }),
    lot('new-jewel', { createdAtMs: 3, categorySlug: 'jewelry', estimateLow: 500, estimateHigh: 900, closesAtMs: 1000 }),
    lot('mid-art', { createdAtMs: 2, estimateLow: 300, estimateHigh: 400, closesAtMs: null }),
    lot('no-estimate', { createdAtMs: 0 }),
  ];

  it('filters by department without mutating the input', () => {
    const before = ids(rows);
    expect(ids(applyBrowse(rows, { dept: 'art', sort: 'newest' }))).toEqual(['mid-art', 'old-art', 'no-estimate']);
    expect(ids(rows)).toEqual(before);
  });

  it('returns nothing for a department with no lots', () => {
    expect(applyBrowse(rows, { dept: 'watches', sort: 'newest' })).toEqual([]);
  });

  it('sorts newest first by default', () => {
    expect(ids(applyBrowse(rows, { dept: null, sort: 'newest' }))).toEqual(['new-jewel', 'mid-art', 'old-art', 'no-estimate']);
  });

  it('sorts by closing time with unscheduled lots last', () => {
    expect(ids(applyBrowse(rows, { dept: null, sort: 'closing' }))).toEqual(['new-jewel', 'old-art', 'mid-art', 'no-estimate']);
  });

  it('orders a staggered sale by lot number when close times tie', () => {
    const sale = [
      lot('lot-3', { lotNumber: 3, closesAtMs: 5000 }),
      lot('lot-1', { lotNumber: 1, closesAtMs: 5000 }),
    ];
    expect(ids(applyBrowse(sale, { dept: null, sort: 'closing' }))).toEqual(['lot-1', 'lot-3']);
  });

  it('sorts by estimate in both directions, lots without one last', () => {
    expect(ids(applyBrowse(rows, { dept: null, sort: 'estimate-desc' }))).toEqual(['new-jewel', 'mid-art', 'old-art', 'no-estimate']);
    expect(ids(applyBrowse(rows, { dept: null, sort: 'estimate-asc' }))).toEqual(['old-art', 'mid-art', 'new-jewel', 'no-estimate']);
  });

  it('falls back to the other estimate bound when one is missing', () => {
    const partial = [lot('high-only', { estimateHigh: 250 }), lot('low-only', { estimateLow: 150 })];
    expect(ids(applyBrowse(partial, { dept: null, sort: 'estimate-desc' }))).toEqual(['high-only', 'low-only']);
    expect(ids(applyBrowse(partial, { dept: null, sort: 'estimate-asc' }))).toEqual(['low-only', 'high-only']);
  });
});
