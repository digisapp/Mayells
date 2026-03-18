import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing the module
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { checkAndExtendAuction } from '../anti-snipe';
import { redis } from '@/lib/redis';

const mockedRedis = vi.mocked(redis);

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
    expect(mockedRedis.get).not.toHaveBeenCalled();
  });

  it('returns extended: false when no close time exists in Redis', async () => {
    mockedRedis.get.mockResolvedValue(null);

    const result = await checkAndExtendAuction('lot-1', 1000, baseSettings);
    expect(result).toEqual({ extended: false });
  });

  it('returns extended: false when bid is outside the snipe window', async () => {
    const closeTime = 1000;
    const bidTime = 500; // Well before the window (1000 - 300 = 700)

    mockedRedis.get.mockResolvedValue(closeTime);

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);
    expect(result).toEqual({ extended: false });
    expect(mockedRedis.set).not.toHaveBeenCalled();
  });

  it('extends the auction when bid is inside the snipe window', async () => {
    const closeTime = 1000;
    const bidTime = 800; // Inside window (1000 - 300 = 700 < 800 < 1000)

    mockedRedis.get.mockResolvedValue(closeTime);

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);

    expect(result.extended).toBe(true);
    expect(result.newCloseTime).toBe(1000 + 120); // closeTime + 2 minutes
    expect(mockedRedis.set).toHaveBeenCalledWith(
      'bid:lot:lot-1:close_time',
      1120,
    );
  });

  it('does not extend when bid is after close time', async () => {
    const closeTime = 1000;
    const bidTime = 1001; // After close

    mockedRedis.get.mockResolvedValue(closeTime);

    const result = await checkAndExtendAuction('lot-1', bidTime, baseSettings);
    expect(result).toEqual({ extended: false });
  });

  it('extends with correct duration based on settings', async () => {
    const closeTime = 2000;
    const bidTime = 1950; // Inside 10-min window

    mockedRedis.get.mockResolvedValue(closeTime);

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

    mockedRedis.get.mockResolvedValue(closeTime);

    const result = await checkAndExtendAuction('lot-1', windowStart, baseSettings);
    expect(result.extended).toBe(true);
  });
});
