'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
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
  /** Why the last send was refused (rate limit, signed out, …); null once one succeeds. */
  const [sendError, setSendError] = useState<string | null>(null);
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

  /**
   * Post a message or reaction. Resolves true when the server accepted it.
   * A refusal (429 rate limit, 401 signed out, or any other error) is
   * surfaced as a toast and in `sendError` rather than silently dropped.
   */
  const sendMessage = useCallback(async (message: string, type: 'chat' | 'reaction' = 'chat'): Promise<boolean> => {
    let reason: string;
    try {
      const res = await fetch(`/api/live/${auctionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, type }),
      });
      if (res.ok) {
        setSendError(null);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      reason =
        res.status === 429
          ? 'You are sending messages too quickly — give it a moment.'
          : res.status === 401
            ? 'Sign in to join the chat.'
            : (typeof data.error === 'string' && data.error) || 'Your message was not sent.';
    } catch {
      reason = 'Network error — your message was not sent.';
    }
    setSendError(reason);
    toast.error(reason);
    return false;
  }, [auctionId]);

  return { messages, connected, sendMessage, sendError };
}
