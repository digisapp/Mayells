import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
  peekRateLimit: vi.fn(),
}));

import { rateLimit, peekRateLimit } from '@/lib/rate-limit';
import { allowAuthEmail, checkLoginAttempt, recordLoginFailure } from '../attempt-limits';

const mockedRateLimit = vi.mocked(rateLimit);
const mockedPeek = vi.mocked(peekRateLimit);

const ok = { success: true, remaining: 1, resetAt: 0 };
const spent = { success: false, remaining: 0, resetAt: 0 };

beforeEach(() => {
  mockedRateLimit.mockReset().mockResolvedValue(ok);
  mockedPeek.mockReset().mockResolvedValue(ok);
});

describe('checkLoginAttempt', () => {
  it('counts the attempt against the IP but only looks at the failure counters', async () => {
    expect(await checkLoginAttempt('1.2.3.4', 'Owner@Mayells.com')).toBe('ok');
    expect(mockedRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedRateLimit.mock.calls[0][0]).toBe('auth:login:ip:1.2.3.4');
    const peeked = mockedPeek.mock.calls.map((c) => [c[0], c[1].maxRequests]);
    expect(peeked).toEqual([
      ['auth:login:fail:ip-email:1.2.3.4:owner@mayells.com', 10],
      ['auth:login:fail:email:owner@mayells.com', 50],
    ]);
  });

  it('reports the IP limit first', async () => {
    mockedRateLimit.mockResolvedValueOnce(spent);
    mockedPeek.mockResolvedValue(spent);
    expect(await checkLoginAttempt('1.2.3.4', 'a@b.com')).toBe('ip');
  });

  it('blocks on either failure counter', async () => {
    mockedPeek.mockResolvedValueOnce(spent);
    expect(await checkLoginAttempt('1.2.3.4', 'a@b.com')).toBe('account');
    mockedPeek.mockReset().mockResolvedValueOnce(ok).mockResolvedValueOnce(spent);
    expect(await checkLoginAttempt('1.2.3.4', 'a@b.com')).toBe('account');
  });
});

describe('recordLoginFailure', () => {
  it('charges the (email, IP) counter and the email ceiling', async () => {
    await recordLoginFailure('1.2.3.4', 'A@B.com');
    expect(mockedRateLimit.mock.calls.map((c) => [c[0], c[1].maxRequests])).toEqual([
      ['auth:login:fail:ip-email:1.2.3.4:a@b.com', 10],
      ['auth:login:fail:email:a@b.com', 50],
    ]);
  });
});

describe('allowAuthEmail', () => {
  it('charges the address ceiling only once the sender’s own limits pass', async () => {
    expect(await allowAuthEmail('forgot', '1.2.3.4', 'A@B.com')).toBe(true);
    expect(mockedRateLimit.mock.calls.map((c) => [c[0], c[1].maxRequests])).toEqual([
      ['auth:forgot:ip:1.2.3.4', 10],
      ['auth:forgot:ip-email:1.2.3.4:a@b.com', 3],
      ['auth:forgot:email:a@b.com', 10],
    ]);
  });

  it('leaves the address ceiling alone when the sender is over its limit', async () => {
    mockedRateLimit.mockResolvedValueOnce(ok).mockResolvedValueOnce(spent);
    expect(await allowAuthEmail('resend', '1.2.3.4', 'a@b.com')).toBe(false);
    expect(mockedRateLimit).toHaveBeenCalledTimes(2);
  });

  it('refuses once the address ceiling is reached', async () => {
    mockedRateLimit.mockResolvedValueOnce(ok).mockResolvedValueOnce(ok).mockResolvedValueOnce(spent);
    expect(await allowAuthEmail('forgot', '5.6.7.8', 'a@b.com')).toBe(false);
  });

  it('fails closed on every counter', async () => {
    await allowAuthEmail('forgot', '1.2.3.4', 'a@b.com');
    expect(mockedRateLimit.mock.calls.every((c) => c[1].failClosed === true)).toBe(true);
  });
});
