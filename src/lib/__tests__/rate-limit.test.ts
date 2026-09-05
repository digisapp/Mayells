import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../redis', () => ({
  redis: { eval: vi.fn() },
  isRedisConfigured: true,
}));
vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { rateLimit } from '../rate-limit';
import { redis } from '../redis';

const mockedEval = vi.mocked(redis.eval);

describe('rateLimit', () => {
  beforeEach(() => {
    mockedEval.mockReset();
  });

  it('runs INCR+EXPIRE as a single atomic script call', async () => {
    mockedEval.mockResolvedValueOnce(1);
    const res = await rateLimit('login:1.2.3.4', { maxRequests: 5, windowSeconds: 60 });
    expect(mockedEval).toHaveBeenCalledTimes(1);
    const [script, keys, args] = mockedEval.mock.calls[0];
    expect(String(script)).toContain('INCR');
    expect(String(script)).toContain('EXPIRE');
    expect(keys[0]).toMatch(/^rate:login:1\.2\.3\.4:\d+$/);
    expect(args[0]).toBe(60);
    expect(res.success).toBe(true);
    expect(res.remaining).toBe(4);
  });

  it('rejects once the window count exceeds maxRequests', async () => {
    mockedEval.mockResolvedValueOnce(6);
    const res = await rateLimit('k', { maxRequests: 5, windowSeconds: 60 });
    expect(res.success).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it('fails open by default when Redis errors', async () => {
    mockedEval.mockRejectedValueOnce(new Error('ECONNRESET'));
    const res = await rateLimit('k', { maxRequests: 5, windowSeconds: 60 });
    expect(res.success).toBe(true);
    expect(res.remaining).toBe(5);
  });

  it('fails closed when asked to and Redis is configured', async () => {
    mockedEval.mockRejectedValueOnce(new Error('ECONNRESET'));
    const res = await rateLimit('k', { maxRequests: 5, windowSeconds: 60, failClosed: true });
    expect(res.success).toBe(false);
    expect(res.remaining).toBe(0);
  });
});
