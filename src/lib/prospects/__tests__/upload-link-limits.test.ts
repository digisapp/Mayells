import { describe, expect, it } from 'vitest';
import { expiryFrom, limitChanges } from '../upload-link-limits';

const now = new Date('2026-10-14T12:00:00Z');
const in14 = new Date('2026-10-28T12:00:00Z');

describe('expiryFrom', () => {
  it('counts days from now, and never for no days', () => {
    expect(expiryFrom(now, 14)).toEqual(in14);
    expect(expiryFrom(now, null)).toBeNull();
    expect(expiryFrom(now, undefined)).toBeNull();
  });
});

describe('limitChanges', () => {
  const open = { maxItems: null, expiresAt: null };

  it('leaves a link alone when no limits are passed', () => {
    expect(limitChanges({ maxItems: 10, expiresAt: in14 }, {}, now)).toBeNull();
  });

  it('applies a new item limit and expiry to a reused link', () => {
    expect(limitChanges(open, { maxItems: 25, expiresInDays: 14 }, now)).toEqual({ maxItems: 25, expiresAt: in14 });
  });

  it('renews the expiry from now on a resend', () => {
    const older = { maxItems: null, expiresAt: new Date('2026-10-15T12:00:00Z') };
    expect(limitChanges(older, { expiresInDays: 14 }, now)).toEqual({ expiresAt: in14 });
  });

  it('clears a limit passed as null', () => {
    expect(limitChanges({ maxItems: 5, expiresAt: in14 }, { maxItems: null, expiresInDays: null }, now)).toEqual({
      maxItems: null,
      expiresAt: null,
    });
  });

  it('writes nothing when the link already matches', () => {
    expect(limitChanges({ maxItems: 5, expiresAt: in14 }, { maxItems: 5, expiresInDays: 14 }, now)).toBeNull();
    expect(limitChanges(open, { maxItems: null, expiresInDays: null }, now)).toBeNull();
  });
});
