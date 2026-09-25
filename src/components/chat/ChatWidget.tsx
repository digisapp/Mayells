'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MessageCircle, X } from 'lucide-react';

// The panel (AI SDK, transport, dialog UI) loads on first open only — keeping
// @ai-sdk/react and the `ai` package out of the shared public-page bundle.
const ChatPanel = dynamic(
  () => import('./ChatPanel').then((m) => m.ChatPanel),
  { ssr: false },
);

const PANEL_ID = 'mayells-chat-panel';

// The bubble rides 1rem above any sticky bottom bar a page shows on phones
// (the bar publishes its height, safe-area padding included, as
// --mobile-cta-bar), else 1rem above the safe area. On the city microsites the
// StickyCallBar (below lg) owns the bottom of the screen, so the bubble sits
// above it there. On phones the panel is a full-screen sheet, so its offset
// only matters on larger screens. Literal class strings so Tailwind generates them.
const OFFSETS = {
  default: {
    bubble: 'bottom-[max(calc(var(--mobile-cta-bar,0px)+1rem),max(1rem,env(safe-area-inset-bottom)))]',
    panel: 'bottom-[max(calc(var(--mobile-cta-bar,0px)+5rem),calc(max(1rem,env(safe-area-inset-bottom))+4rem))]',
  },
  aboveStickyBar: {
    bubble: 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-[max(1rem,env(safe-area-inset-bottom))]',
    panel: 'bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] lg:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4rem)]',
  },
} as const;

// The labelled pill needs room: sm width AND 500px of height, so phones in
// landscape keep the compact circle too. Tailwind has no height breakpoint,
// hence the arbitrary media variant.
const PILL = {
  button: '[@media(min-width:640px)_and_(min-height:500px)]:h-auto [@media(min-width:640px)_and_(min-height:500px)]:w-auto [@media(min-width:640px)_and_(min-height:500px)]:hover:scale-105',
  open: '[@media(min-width:640px)_and_(min-height:500px)]:p-4',
  closed: '[@media(min-width:640px)_and_(min-height:500px)]:py-4 [@media(min-width:640px)_and_(min-height:500px)]:px-5',
  bounce: '[@media(min-width:640px)_and_(min-height:500px)]:motion-safe:animate-[bounceGentle_2s_ease-in-out_3]',
  icon: 'h-6 w-6 [@media(min-width:640px)_and_(min-height:500px)]:h-7 [@media(min-width:640px)_and_(min-height:500px)]:w-7',
  label: 'hidden [@media(min-width:640px)_and_(min-height:500px)]:inline-block',
} as const;

interface ChatWidgetProps {
  /** City microsite slug; see ChatPanel. */
  site?: string;
  aboveStickyBar?: boolean;
}

export function ChatWidget({ site, aboveStickyBar = false }: ChatWidgetProps = {}) {
  const offsets = aboveStickyBar ? OFFSETS.aboveStickyBar : OFFSETS.default;
  const [open, setOpen] = useState(false);
  // Once opened, the panel stays mounted (hidden on close) so the chat
  // history survives closing and reopening the bubble.
  const [everOpened, setEverOpened] = useState(false);
  const [showLabel, setShowLabel] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Hide the text label (never shown on phones) after 8 seconds to reduce visual noise
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

  const close = useCallback(() => {
    setOpen(false);
    // Focus returns to the control that opened the chat.
    launcherRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      {everOpened && (
        <ChatPanel
          id={PANEL_ID}
          visible={open}
          onClose={close}
          pendingMessage={pendingMessage}
          onPendingConsumed={() => setPendingMessage(null)}
          site={site}
          offsetClassName={offsets.panel}
        />
      )}

      {/* Floating bubble: a compact icon-only circle on phones, where a pill
          would sit over page content; the labelled pill on larger screens. */}
      <button
        ref={launcherRef}
        type="button"
        data-chat-launcher=""
        onClick={() => {
          setOpen(!open);
          setEverOpened(true);
          setShowLabel(false);
        }}
        className={`fixed ${offsets.bubble} right-[max(1rem,env(safe-area-inset-right))] sm:right-[max(1.5rem,env(safe-area-inset-right))] z-50 flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-champagne text-charcoal shadow-lg transition-[bottom,box-shadow,scale] duration-300 ease-out hover:shadow-xl motion-reduce:transition-none ${PILL.button} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 ${
          open ? PILL.open : PILL.closed
        } ${!open && showLabel ? PILL.bounce : ''}`}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        aria-haspopup="dialog"
      >
        {open ? (
          <X className={PILL.icon} aria-hidden />
        ) : (
          <>
            <MessageCircle className={PILL.icon} aria-hidden />
            <span
              className={`${PILL.label} font-semibold text-base whitespace-nowrap overflow-hidden transition-all duration-500 motion-reduce:transition-none ${
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
