import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Claiming a shadow seller on signup. The consignor's portal link (sent in
 * every statement and payout email) must keep working on the real account,
 * and the unique portal_token must be freed on the tombstone BEFORE the real
 * row takes it. The DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const ops: { op: 'update' | 'insert'; values: Record<string, unknown> }[] = [];
  const selectResults: unknown[][] = [];
  function chain(op: 'select' | 'update' | 'insert') {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'limit']) c[m] = self;
    c.set = (v: Record<string, unknown>) => { ops.push({ op: 'update', values: v }); return c; };
    c.values = (v: Record<string, unknown>) => { ops.push({ op: 'insert', values: v }); return c; };
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(op === 'select' ? selectResults.shift() ?? [] : []).then(res, rej);
    return c;
  }
  const tx = { select: () => chain('select'), update: () => chain('update'), insert: () => chain('insert') };
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    ops,
    selectResults,
    table,
    getUserById: vi.fn(),
    db: { ...tx, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) },
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({
  users: h.table(),
  lots: h.table(),
  consignments: h.table(),
  shipments: h.table(),
  payouts: h.table(),
  sellerProspects: h.table(),
  invoices: h.table(),
  payments: h.table(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { getUserById: h.getUserById } } }),
}));
vi.mock('@/lib/supabase/env', () => ({ supabaseUrl: () => 'https://example.supabase.co' }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { claimShadowUserByEmail } from '../shadow';
import { SHADOW_EMAIL_DOMAIN } from '../sentinel';

const SHADOW_TOKEN = '11111111-2222-4333-8444-555555555555';

afterEach(() => {
  h.ops.length = 0;
  h.selectResults.length = 0;
  vi.clearAllMocks();
});

describe('claimShadowUserByEmail', () => {
  it('moves the shadow portal token to the new account, freeing it on the tombstone first', async () => {
    h.selectResults.push([
      { id: 'shadow-1', email: 'jane@example.com', role: 'seller', fullName: 'Jane', portalToken: SHADOW_TOKEN },
    ]);
    h.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } });

    const claimed = await claimShadowUserByEmail({ authUserId: 'auth-1', email: 'jane@example.com' });

    expect(claimed).toBe(true);
    const tombstone = h.ops.findIndex((o) => o.op === 'update' && 'portalToken' in o.values);
    const insert = h.ops.findIndex((o) => o.op === 'insert');
    expect(tombstone).toBeGreaterThanOrEqual(0);
    expect(tombstone).toBeLessThan(insert);
    expect(h.ops[tombstone].values.portalToken).not.toBe(SHADOW_TOKEN);
    expect(h.ops[tombstone].values.email).toBe(`claimed-shadow-1@${SHADOW_EMAIL_DOMAIN}`);
    expect(h.ops[insert].values).toMatchObject({ id: 'auth-1', email: 'jane@example.com', portalToken: SHADOW_TOKEN, role: 'seller' });
  });

  it('never claims a row that belongs to a real auth account', async () => {
    h.selectResults.push([{ id: 'real-1', email: 'jane@example.com', role: 'buyer', portalToken: SHADOW_TOKEN }]);
    h.getUserById.mockResolvedValue({ data: { user: { id: 'real-1' } }, error: null });

    expect(await claimShadowUserByEmail({ authUserId: 'auth-1', email: 'jane@example.com' })).toBe(false);
    expect(h.ops).toHaveLength(0);
  });
});
