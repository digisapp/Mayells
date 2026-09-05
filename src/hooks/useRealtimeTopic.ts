'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to a private Supabase Realtime broadcast topic and invoke
 * `onEvent` for every message. Returns whether the subscription is live so
 * callers can relax their polling fallback while connected and tighten it
 * when the socket is down (or when Realtime authorization is not yet
 * configured — see migration 0019 — in which case polling carries the load).
 *
 * Pass `null` as the topic to stay unsubscribed (e.g. once a lot has closed).
 */
export function useRealtimeTopic(
  topic: string | null,
  onEvent: (event: string, payload: unknown) => void,
): { connected: boolean } {
  const [subscribed, setSubscribed] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  // Latest handler without resubscribing on every render (assigned in an
  // effect — the React compiler forbids touching refs during render).
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!topic) return;

    let disposed = false;
    // Private channels need the caller's JWT (or the anon key) so Realtime can
    // evaluate the receive-only RLS policy.
    supabase.realtime.setAuth();
    const channel = supabase.channel(topic, { config: { private: true } });

    channel
      .on('broadcast', { event: '*' }, (message) => {
        if (disposed) return;
        handlerRef.current(message.event, message.payload);
      })
      .subscribe((status) => {
        if (disposed) return;
        setSubscribed(status === 'SUBSCRIBED');
      });

    return () => {
      disposed = true;
      setSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [topic, supabase]);

  return { connected: !!topic && subscribed };
}
