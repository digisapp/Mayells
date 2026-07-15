import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing the module. The extension logic now runs inside
// an atomic Lua script (redis.eval) so a stale read can't move the close time
// backwards; the mock below faithfully simulates that script's contract so the
// window-boundary behavior is still verified here.
vi.mock('@/lib/redis', () => ({
  redis: {
    eval: vi.fn(),
  },
}));

import { checkAndExtendAuction } from '../anti-snipe';
import { redis } from '@/lib/redis';

const mockedRedis = vi.mocked(redis);

// Mirror of EXTEND_CLOSE_TIME_LUA: given the stored close time, decide whether
// a bid at ARGV[0] within window ARGV[1] extends by ARGV[2].
function fakeEval(storedCloseTime: number | null) {
  return async (_script: string, _keys: string[], args: unknown[]) => {
    if (storedCloseTime == null) return JSON.stringify({ extended: false });
    const argv = args as string[];
    const bidTs = Number(argv[0]);
    const windowSecs = Number(argv[1]);
    const extSecs = Number(argv[2]);
    const windowStart = storedCloseTime - windowSecs;
    if (bidTs >= windowStart && bidTs < storedCloseTime) {
      return JSON.stringify({ extended: true, newCloseTime: storedCloseTime + extSecs });
    }
    return JSON.stringify({ extended: false });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkAndExtendAuction', () => {
  const baseSettings = {
    antiSnipeEnabled: true,
    antiSnipeMinutes: 2,
    antiSnipeWindowMinutes: 5,
  };

  it('returns extended: false when anti-snipe is disabled', async () => {
    const result = await checkAndExtendAuction('lot-1', 1000, {
      ...baseSettings,
      antiSnipeEnabled: false,
    });
    expect(result).toEqual({ extended: false });
    expect(mockedRedis.eval).not.toHaveBeenCalled();
  });

  it('returns extended: false when no close time exists in Redis', async () => {
    mockedRedis.eval.mockImplementation(fakeEval(null));

    const result = await checkAndExtendAuction('lot-1', 1000, baseSettings);
    expect(result).toEqual({ extended: false });
  });

  it('returns extended: false when bid is outside the snipe window', async () => {
    const closeTime = 1000;
    const bidTime = 500; // Well before the window (1000 - 300 = 700)

    mockedRedis.eval.mockImplementation(fakeEval(closeTime));

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);
    expect(result).toEqual({ extended: false });
  });

  it('extends the auction when bid is inside the snipe window', async () => {
    const closeTime = 1000;
    const bidTime = 800; // Inside window (1000 - 300 = 700 < 800 < 1000)

    mockedRedis.eval.mockImplementation(fakeEval(closeTime));

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);

    expect(result.extended).toBe(true);
    expect(result.newCloseTime).toBe(1000 + 120); // closeTime + 2 minutes
    // Verify the wrapper passed the window and extension in seconds.
    const [, keys, argv] = mockedRedis.eval.mock.calls[0];
    expect(keys).toEqual(['bid:lot:lot-1:close_time']);
    expect(argv).toEqual(['800', '300', '120']);
  });

  it('does not extend when bid is after close time', async () => {
    const closeTime = 1000;
    const bidTime = 1001; // After close

    mockedRedis.eval.mockImplementation(fakeEval(closeTime));

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);
    expect(result).toEqual({ extended: false });
  });

  it('extends with correct duration based on settings', async () => {
    const closeTime = 2000;
    const bidTime = 1950; // Inside 10-min window

    mockedRedis.eval.mockImplementation(fakeEval(closeTime));

    const result = await checkAndExtendAuction('lot-1', bidTime, {
      antiSnipeEnabled: true,
      antiSnipeMinutes: 5,
      antiSnipeWindowMinutes: 10,
    });

    expect(result.extended).toBe(true);
    expect(result.newCloseTime).toBe(2000 + 300); // 5 minutes extension
  });

  it('extends when bid is exactly at window start', async () => {
    const closeTime = 1000;
    const windowStart = closeTime - (5 * 60); // 700

    mockedRedis.eval.mockImplementation(fakeEval(closeTime));

    const result = await checkAndExtendAuction('lot-1', windowStart, baseSettings);
    expect(result.extended).toBe(true);
  });
});
