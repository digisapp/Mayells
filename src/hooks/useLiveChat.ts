'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChatMessage {
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
    const channel = supabase.channel(`live:${auctionId}`);

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        setMessages((prev) => [...prev.slice(-200), payload as ChatMessage]);
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
