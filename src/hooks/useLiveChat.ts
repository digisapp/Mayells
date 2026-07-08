'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChatMessage {
  /** Stable client-side id assigned when the message is received (used as React key) */
  id: string;
  userId: string;
  displayName: string;
  role: string;
  message: string;
  messageType: 'chat' | 'reaction' | 'bid_notification';
  timestamp: string;
}

export function useLiveChat(auctionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  // Memoize supabase client to prevent useEffect re-running on every render
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Private channel: the client must present its session JWT so Realtime
    // can authorize it against the receive-only RLS policy. Regular users can
    // receive but not send, so forged broadcasts are rejected server-side.
    supabase.realtime.setAuth();
    const channel = supabase.channel(`live:${auctionId}`, {
      config: { private: true },
    });

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        // Assign the id outside the updater so it stays pure (StrictMode double-invokes it)
        const message: ChatMessage = {
          ...(payload as Omit<ChatMessage, 'id'>),
          id: crypto.randomUUID(),
        };
        setMessages((prev) => [...prev.slice(-200), message]);
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, supabase]);

  const sendMessage = useCallback(async (message: string, type: 'chat' | 'reaction' = 'chat') => {
    await fetch(`/api/live/${auctionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, type }),
    });
  }, [auctionId]);

  return { messages, connected, sendMessage };
}
