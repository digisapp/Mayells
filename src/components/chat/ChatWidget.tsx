'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MessageCircle, X } from 'lucide-react';

// The panel (AI SDK, transport, dialog UI) loads on first open only — keeping
// @ai-sdk/react and the `ai` package out of the shared public-page bundle.
const ChatPanel = dynamic(
  () => import('./ChatPanel').then((m) => m.ChatPanel),
  { ssr: false },
);

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  // Once opened, the panel stays mounted (hidden on close) so the chat
  // history survives closing and reopening the bubble.
  const [everOpened, setEverOpened] = useState(false);
  const [showLabel, setShowLabel] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Hide the text label after 8 seconds to reduce visual noise
  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Listen for external open-chat events (e.g. from appraisal CTA)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOpen(true);
      setEverOpened(true);
      if (detail?.message) {
        setPendingMessage(detail.message);
      }
    };
    window.addEventListener('open-chat', handler);
    return () => window.removeEventListener('open-chat', handler);
  }, []);

  return (
    <>
      {everOpened && (
        <ChatPanel
          visible={open}
          onClose={() => setOpen(false)}
          pendingMessage={pendingMessage}
          onPendingConsumed={() => setPendingMessage(null)}
        />
      )}

      {/* Floating Bubble */}
      <button
        onClick={() => {
          setOpen(!open);
          setEverOpened(true);
          setShowLabel(false);
        }}
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 sm:right-6 z-50 bg-champagne text-charcoal shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 ${
          open ? 'rounded-full p-4' : 'rounded-full py-4 px-5'
        } ${!open && showLabel ? 'animate-bounce-gentle' : ''}`}
        aria-label="Chat with us"
      >
        {open ? (
          <X className="h-7 w-7" />
        ) : (
          <>
            <MessageCircle className="h-7 w-7" />
            <span
              className={`font-semibold text-base whitespace-nowrap overflow-hidden transition-all duration-500 ${
                showLabel ? 'max-w-[130px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              Chat With Us
            </span>
          </>
        )}
      </button>
    </>
  );
}
