'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bindResumeTriggers, createTopicHub, retryingLoader, type TopicHub, type TopicTransport } from './realtime-hub';

// Loaded on demand: the Supabase browser client (auth + realtime) is ~60KB
// compressed, and most pages never subscribe to anything. A failed download
// is retried by the next open (the hub re-opens failed topics on resume).
const client = retryingLoader<SupabaseClient>(() =>
  import('@/lib/supabase/client').then(({ createClient }) => createClient()),
);

const supabaseTransport: TopicTransport = {
  async open(topic, onEvent, onStatus) {
    const supabase = await client.get();
    // Private channels need the caller's JWT (or the anon key) so Realtime
    // can evaluate the receive-only RLS policy. Bounded so a slow token
    // refresh can't stall every other topic queued behind this one.
    await Promise.race([
      supabase.realtime.setAuth().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    const channel = supabase.channel(topic, { config: { private: true } });
    channel
      .on('broadcast', { event: '*' }, (message) => onEvent(message.event, message.payload))
      .subscribe((status) => onStatus(status));
    return async () => {
      await supabase.removeChannel(channel);
    };
  },
  async reset() {
    const loading = client.peek();
    if (!loading) return;
    try {
      const supabase = await loading;
      await supabase.realtime.disconnect();
    } catch {
      // Never loaded (the next open retries the download), or the socket is
      // already gone: either way there is nothing left to drop.
    }
  },
};

let hub: TopicHub | null = null;
function getHub(): TopicHub {
  if (!hub) {
    hub = createTopicHub(supabaseTransport);
    bindResumeTriggers(hub);
  }
  return hub;
}

export interface RealtimeTopicOptions {
  /**
   * The page came back from the background, a bfcache restore or a network
   * drop. The channel is being re-joined; refetch anything that may have
   * changed while events could not arrive.
   */
  onResume?: () => void;
  /** Every connect / disconnect of the shared channel. */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Subscribe to a private Supabase Realtime broadcast topic and invoke
 * `onEvent` for every message. Returns whether the subscription is live so
 * callers can relax their polling fallback while connected and tighten it
 * when the socket is down (or when Realtime authorization is not yet
 * configured — see migration 0019 — in which case polling carries the load).
 *
 * Any number of components may subscribe to the same topic: they share one
 * channel (see realtime-hub). Pass `null` as the topic to stay unsubscribed
 * (e.g. once a lot has closed).
 */
export function useRealtimeTopic(
  topic: string | null,
  onEvent: (event: string, payload: unknown) => void,
  options?: RealtimeTopicOptions,
): { connected: boolean } {
  // Which topic is currently connected — compared against `topic` so a
  // stale "true" from a previous topic never leaks into the next one.
  const [connectedTopic, setConnectedTopic] = useState<string | null>(null);
  // Latest callbacks without resubscribing on every render (assigned in an
  // effect — the React compiler forbids touching refs during render).
  const handlerRef = useRef(onEvent);
  const optionsRef = useRef(options);
  useEffect(() => {
    handlerRef.current = onEvent;
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!topic) return;
    const unsubscribe = getHub().subscribe(topic, {
      onEvent: (event, payload) => handlerRef.current(event, payload),
      onConnectedChange: (connected) => {
        setConnectedTopic(connected ? topic : null);
        optionsRef.current?.onConnectionChange?.(connected);
      },
      onResume: () => optionsRef.current?.onResume?.(),
    });
    return () => {
      unsubscribe();
      setConnectedTopic(null);
    };
  }, [topic]);

  return { connected: !!topic && connectedTopic === topic };
}
