import { redis } from '@/lib/redis';

interface AntiSnipeSettings {
  antiSnipeEnabled: boolean;
  antiSnipeMinutes: number;
  antiSnipeWindowMinutes: number;
}

interface AntiSnipeResult {
  extended: boolean;
  newCloseTime?: number;
}

export async function checkAndExtendAuction(
  lotId: string,
  bidTimestamp: number,
  settings: AntiSnipeSettings,
): Promise<AntiSnipeResult> {
  if (!settings.antiSnipeEnabled) return { extended: false };

  const closeTimeKey = `bid:lot:${lotId}:close_time`;
  const currentCloseTime = await redis.get<number>(closeTimeKey);

  if (!currentCloseTime) return { extended: false };

  const windowStart = currentCloseTime - (settings.antiSnipeWindowMinutes * 60);

  if (bidTimestamp >= windowStart && bidTimestamp < currentCloseTime) {
    const newCloseTime = currentCloseTime + (settings.antiSnipeMinutes * 60);
    await redis.set(closeTimeKey, newCloseTime);
    return { extended: true, newCloseTime };
  }

  return { extended: false };
}
