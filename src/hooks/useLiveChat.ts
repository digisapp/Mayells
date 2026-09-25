'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRealtimeTopic } from './useRealtimeTopic';

export interface ChatMessage {
  /** Stable client-side id assigned when the message is received (used as React key) */
  id: string;
  userId: string;
  displayName: string;
  role: string;
  message: string;
  /**
   * `system` is client-generated, never broadcast: a "Reconnected" marker
   * placed where messages may be missing after the socket dropped.
   */
  messageType: 'chat' | 'reaction' | 'bid_notification' | 'system';
  timestamp: string;
}

// crypto.randomUUID only exists in secure contexts; ids are just React keys.
function messageId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useLiveChat(auctionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Why the last send was refused (rate limit, signed out, …); null once one succeeds. */
  const [sendError, setSendError] = useState<string | null>(null);
  // Set when the page resumes; the next successful join drops a marker.
  const resumedRef = useRef(false);

  const onEvent = useCallback((event: string, payload: unknown) => {
    // The viewer shares this channel and handles the lot events itself.
    if (event !== 'chat') return;
    // Assign the id outside the updater so it stays pure (StrictMode double-invokes it)
    const message: ChatMessage = { ...(payload as Omit<ChatMessage, 'id'>), id: messageId() };
    setMessages((prev) => [...prev.slice(-200), message]);
  }, []);

  // Chat is broadcast-only (nothing is stored server-side), so messages sent
  // while the socket was down can't be backfilled. Mark the gap instead —
  // only when there is a conversation to interrupt, and never twice in a row.
  const onConnectionChange = useCallback((connected: boolean) => {
    if (!connected || !resumedRef.current) return;
    resumedRef.current = false;
    const marker: ChatMessage = {
      id: messageId(),
      userId: '',
      displayName: '',
      role: 'system',
      message: 'Reconnected',
      messageType: 'system',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) =>
      prev.length === 0 || prev[prev.length - 1].messageType === 'system' ? prev : [...prev.slice(-200), marker],
    );
  }, []);

  const onResume = useCallback(() => {
    resumedRef.current = true;
  }, []);

  // Private channel: Realtime authorizes the session JWT against the
  // receive-only RLS policy, so viewers can listen but never forge a
  // broadcast. Shared with the live viewer's own subscription to this topic.
  const { connected } = useRealtimeTopic(`live:${auctionId}`, onEvent, { onResume, onConnectionChange });

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
