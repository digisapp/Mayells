import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Server-side Supabase Realtime broadcasts.
 *
 * Channels are PRIVATE: clients may only RECEIVE (RLS on realtime.messages,
 * see migrations 0006 and 0019) and only the service-role client used here can
 * SEND, so a viewer can never forge a "new bid" event. Clients treat every
 * event as a hint to refetch authoritative state from the server — payloads
 * are informational and never trusted for money-related rendering.
 *
 * Best-effort: a Realtime outage must never fail a bid or a settlement, so
 * every call swallows and logs its errors.
 */
export const lotTopic = (lotId: string) => `lot:${lotId}`;
export const liveAuctionTopic = (auctionId: string) => `live:${auctionId}`;

export type LotEvent = 'bid' | 'closed';
export type LiveAuctionEvent = 'lot_bid' | 'lot_closed';

async function send(topic: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(topic, { config: { private: true } });
  try {
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') {
      logger.warn('Realtime broadcast not delivered', { topic, event, result });
    }
  } catch (err) {
    logger.error('Realtime broadcast failed', err, { topic, event });
  } finally {
    try {
      await admin.removeChannel(channel);
    } catch {
      // nothing to clean up
    }
  }
}

/** Notify viewers of a lot that its bid state changed (new bid, extension, close). */
export function broadcastLotEvent(
  lotId: string,
  event: LotEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  return send(lotTopic(lotId), event, { lotId, at: Date.now(), ...payload });
}

/** Notify the live-auction room that one of its lots changed. */
export function broadcastLiveAuctionEvent(
  auctionId: string,
  event: LiveAuctionEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  return send(liveAuctionTopic(auctionId), event, { auctionId, at: Date.now(), ...payload });
}
