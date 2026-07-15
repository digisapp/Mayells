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

// Atomic read-modify-write of the close time. A plain GET→SET lets a bidder
// holding a stale read overwrite a larger close time that landed in between,
// moving the deadline BACKWARDS. Doing the compare-and-extend inside one Lua
// call removes the race and guarantees the close time is monotonic.
//
// KEYS[1] = close time key
// ARGV[1] = bid timestamp (unix secs)
// ARGV[2] = anti-snipe window (secs)
// ARGV[3] = anti-snipe extension (secs)
const EXTEND_CLOSE_TIME_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({extended=false}) end
local closeTime = tonumber(raw)
local bidTs = tonumber(ARGV[1])
local windowStart = closeTime - tonumber(ARGV[2])
if bidTs >= windowStart and bidTs < closeTime then
  local newCloseTime = closeTime + tonumber(ARGV[3])
  redis.call('SET', KEYS[1], newCloseTime)
  return cjson.encode({extended=true, newCloseTime=newCloseTime})
end
return cjson.encode({extended=false})
`;

export async function checkAndExtendAuction(
  lotId: string,
  bidTimestamp: number,
  settings: AntiSnipeSettings,
): Promise<AntiSnipeResult> {
  if (!settings.antiSnipeEnabled) return { extended: false };

  const closeTimeKey = `bid:lot:${lotId}:close_time`;

  const raw = await redis.eval(
    EXTEND_CLOSE_TIME_LUA,
    [closeTimeKey],
    [
      bidTimestamp.toString(),
      (settings.antiSnipeWindowMinutes * 60).toString(),
      (settings.antiSnipeMinutes * 60).toString(),
    ],
  );

  const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as AntiSnipeResult;
  return parsed && parsed.extended
    ? { extended: true, newCloseTime: parsed.newCloseTime }
    : { extended: false };
}
