import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { bidderAlias, publicBidderLabel, liveViewerIdentity, liveDisplayName } from '../bidder-alias';

const KEYS = ['BIDDER_ALIAS_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.BIDDER_ALIAS_SECRET = 'test-alias-secret';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('bidder aliases', () => {
  it('keeps the "Bidder xxxxxx" label format, stable per lot', () => {
    const label = publicBidderLabel('lot-1', 'user-1');
    expect(label).toMatch(/^Bidder [0-9a-f]{6}$/);
    expect(publicBidderLabel('lot-1', 'user-1')).toBe(label);
  });

  it('cannot be recomputed from the ids alone (keyed, not a plain hash)', () => {
    const plain = createHash('sha256').update('lot-1:user-1').digest('hex').slice(0, 6);
    expect(publicBidderLabel('lot-1', 'user-1')).not.toBe(`Bidder ${plain}`);
  });

  it('gives unrelated aliases in different scopes', () => {
    expect(bidderAlias('lot-1', 'user-1')).not.toBe(bidderAlias('lot-2', 'user-1'));
    expect(liveViewerIdentity('auction-1', 'user-1')).not.toContain('user-1');
    expect(liveViewerIdentity('auction-1', 'user-1')).not.toBe(liveViewerIdentity('auction-2', 'user-1'));
  });

  it('falls back to the service-role key, and refuses to run with no secret', () => {
    delete process.env.BIDDER_ALIAS_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(bidderAlias('lot-1', 'user-1')).toMatch(/^[0-9a-f]{6}$/);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => bidderAlias('lot-1', 'user-1')).toThrow();
  });
});

describe('liveDisplayName', () => {
  it('uses the chosen display name, then the paddle, then an alias — never the legal name', () => {
    expect(liveDisplayName('a-1', 'u-1', { displayName: ' Collector ', paddleNumber: '42' })).toBe('Collector');
    expect(liveDisplayName('a-1', 'u-1', { displayName: '', paddleNumber: '42' })).toBe('Paddle 42');
    expect(liveDisplayName('a-1', 'u-1', { displayName: null, paddleNumber: null })).toMatch(/^Bidder [0-9a-f]{6}$/);
    const withLegalName = { displayName: null, paddleNumber: null, fullName: 'Jane Q. Public' };
    expect(liveDisplayName('a-1', 'u-1', withLegalName)).not.toContain('Jane');
  });
});
