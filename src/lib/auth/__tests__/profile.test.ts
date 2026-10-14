import { describe, it, expect, vi, beforeEach } from 'vitest';

const values = vi.fn();
const onConflictDoNothing = vi.fn();

vi.mock('@/db', () => ({
  db: { insert: vi.fn(() => ({ values })) },
}));
vi.mock('@/db/schema', () => ({ users: { id: 'id' } }));
vi.mock('@/lib/sellers/shadow', () => ({ claimShadowUserByEmail: vi.fn() }));

import { claimShadowUserByEmail } from '@/lib/sellers/shadow';
import { ensureUserProfile } from '../profile';

const mockedClaim = vi.mocked(claimShadowUserByEmail);

beforeEach(() => {
  values.mockReset().mockReturnValue({ onConflictDoNothing });
  onConflictDoNothing.mockReset().mockResolvedValue(undefined);
  mockedClaim.mockReset();
});

describe('ensureUserProfile', () => {
  it('creates a new profile as a buyer and leaves an existing row alone', async () => {
    await ensureUserProfile({ id: 'u1', email: 'a@b.com', fullName: 'A' });
    expect(values).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com', fullName: 'A', role: 'buyer' });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it('claims a shadow seller row as a buyer (the shadow row keeps its own seller status)', async () => {
    onConflictDoNothing.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "users_email_unique"'));
    mockedClaim.mockResolvedValueOnce(true);
    await ensureUserProfile({ id: 'u1', email: 'a@b.com' });
    expect(mockedClaim).toHaveBeenCalledWith(expect.objectContaining({ authUserId: 'u1', role: 'buyer' }));
  });

  it('rethrows the insert error when there is nothing to claim', async () => {
    const err = new Error('boom');
    onConflictDoNothing.mockRejectedValueOnce(err);
    mockedClaim.mockResolvedValueOnce(false);
    await expect(ensureUserProfile({ id: 'u1', email: 'a@b.com' })).rejects.toBe(err);
  });
});
