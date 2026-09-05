import { describe, it, expect } from 'vitest';
import { publicLotPath } from '../urls';

describe('publicLotPath', () => {
  it('routes gallery and private-treaty lots under /gallery', () => {
    expect(publicLotPath({ slug: 'ming-vase', id: 'x', saleType: 'gallery' })).toBe('/gallery/ming-vase');
    expect(publicLotPath({ slug: 'ming-vase', id: 'x', saleType: 'private' })).toBe('/gallery/ming-vase');
  });

  it('routes auction lots under /lots', () => {
    expect(publicLotPath({ slug: 'ming-vase', id: 'x', saleType: 'auction' })).toBe('/lots/ming-vase');
  });

  it('falls back to the id when a lot has no slug', () => {
    expect(publicLotPath({ slug: null, id: 'abc-123', saleType: 'auction' })).toBe('/lots/abc-123');
    expect(publicLotPath({ slug: '', id: 'abc-123', saleType: 'gallery' })).toBe('/gallery/abc-123');
  });

  it('never emits the /browse route-group prefix', () => {
    expect(publicLotPath({ slug: 's', id: 'i', saleType: 'auction' })).not.toContain('/browse/');
  });
});
