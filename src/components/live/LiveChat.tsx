'use client';

import { useState, useRef, useEffect, useId, type FormEvent, type RefObject } from 'react';
import Link from 'next/link';
import { useLiveChat, type ChatMessage } from '@/hooks/useLiveChat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const REACTIONS = [
  { emoji: '🔥', label: 'Fire' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '⭐', label: 'Star' },
];

/** What the panel needs from useLiveChat; the viewer owns the hook so its reactions can live in the phone tab bar. */
export type LiveChatState = Pick<ReturnType<typeof useLiveChat>, 'messages' | 'connected' | 'sendMessage'>;

interface LiveChatProps {
  auctionId: string;
  className?: string;
}

/** Self-contained chat for the admin live console (staff are always signed in). */
export function LiveChat({ auctionId, className }: LiveChatProps) {
  const chat = useLiveChat(auctionId);
  return <LiveChatPanel chat={chat} signedIn className={cn('rounded-lg border border-border', className)} />;
}

interface LiveChatPanelProps {
  chat: LiveChatState;
  signedIn: boolean;
  /** Where "Sign in" goes; should bring the viewer back to this sale. */
  signInHref?: string;
  className?: string;
  headerClassName?: string;
  reactionsClassName?: string;
  /**
   * Publish the composer's height as --mobile-cta-bar (shared site contract)
   * so toasts float above it on phones instead of covering Send.
   */
  reportsMobileBar?: boolean;
}

export function LiveChatPanel({
  chat,
  signedIn,
  signInHref = '/login',
  className,
  headerClassName,
  reactionsClassName,
  reportsMobileBar = false,
}: LiveChatPanelProps) {
  const { messages, connected, sendMessage } = chat;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  // Follow new messages only while the reader is at the bottom; someone
  // scrolling back through the conversation shouldn't be yanked down.
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useMobileBarHeight(bottomBarRef, reportsMobileBar, signedIn);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    // Clear immediately so sending feels instant; put the text back if the
    // server refused it (the hook already explains why in a toast).
    setInput('');
    setSending(true);
    stickToBottom.current = true;
    const ok = await sendMessage(text);
    setSending(false);
    if (!ok) setInput((current) => current || text);
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background text-foreground', className)}>
      <div className={cn('flex items-center justify-between border-b border-border px-4 py-3', headerClassName)}>
        <h2 className="text-sm font-medium">Live chat</h2>
        <ConnectionStatus connected={connected} />
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {signedIn ? 'The saleroom conversation will appear here.' : 'Sign in to follow the saleroom conversation.'}
          </p>
        )}
      </div>

      {signedIn ? (
        <div ref={bottomBarRef} className="border-t border-border">
          <ChatReactions
            onReact={(emoji) => sendMessage(emoji, 'reaction')}
            className={cn('px-3 pt-2', reactionsClassName)}
          />
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >
            <label htmlFor={inputId} className="sr-only">
              Message the room
            </label>
            <Input
              id={inputId}
              name="message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message the room"
              autoComplete="off"
              enterKeyHint="send"
              maxLength={500}
              // 16px everywhere: anything smaller makes iOS zoom the page on focus.
              className="h-11 bg-muted/60 text-base placeholder:text-muted-foreground md:text-base"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              disabled={!input.trim() || sending}
              // Keep focus (and the phone keyboard) on the input when tapping Send.
              onMouseDown={(e) => e.preventDefault()}
              className="size-11 shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      ) : (
        <div
          ref={bottomBarRef}
          className="flex items-center justify-between gap-3 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <p className="text-sm text-muted-foreground">Registered bidders can chat with the room.</p>
          <Button asChild className="h-11 shrink-0 px-5">
            <Link href={signInHref}>Sign in</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn('size-2 rounded-full', connected ? 'bg-green-500' : 'bg-amber-400')} />
      {connected ? 'Connected' : 'Connecting…'}
    </span>
  );
}

export function ChatReactions({ onReact, className }: { onReact: (emoji: string) => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {REACTIONS.map((r) => (
        <button
          key={r.label}
          type="button"
          aria-label={`Send ${r.label.toLowerCase()} reaction`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onReact(r.emoji)}
          className="flex size-10 items-center justify-center rounded-full text-lg transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden>{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  // Client-side marker where messages may be missing after a dropped socket.
  if (message.messageType === 'system') {
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        {message.message}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (message.messageType === 'reaction') {
    return (
      <div className="text-center">
        <span
          aria-label={`${message.displayName} reacted ${message.message}`}
          className="inline-block text-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-300"
        >
          {message.message}
        </span>
      </div>
    );
  }

  if (message.messageType === 'bid_notification') {
    return (
      <div className="rounded border border-champagne/25 bg-champagne/10 px-3 py-2">
        <p className="text-sm font-medium text-champagne-deep dark:text-champagne">{message.message}</p>
      </div>
    );
  }

  const isAuctioneer = message.role === 'auctioneer' || message.role === 'admin';

  return (
    <p className="text-sm leading-snug [overflow-wrap:anywhere]">
      <span className={cn('whitespace-nowrap font-medium', isAuctioneer ? 'text-champagne-deep dark:text-champagne' : 'text-foreground')}>
        {message.displayName}
      </span>
      {isAuctioneer && (
        <span className="ml-1.5 rounded bg-champagne/15 px-1.5 py-0.5 align-middle text-[11px] font-medium text-champagne-deep dark:text-champagne">
          Auctioneer
        </span>
      )}
      <span className="ml-2 text-foreground/75">{message.message}</span>
    </p>
  );
}

/**
 * Shared contract: while a bottom bar is showing on a phone, its height lives
 * in --mobile-cta-bar on <html> so floating UI (toasts) sits above it. Hidden
 * bars (display:none measures 0) and desktop widths clear it. `barKey`
 * re-measures when a different bar (composer vs sign-in prompt) mounts.
 */
function useMobileBarHeight(ref: RefObject<HTMLElement | null>, enabled: boolean, barKey: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0 && !desktop.matches) root.style.setProperty('--mobile-cta-bar', `${h}px`);
      else root.style.removeProperty('--mobile-cta-bar');
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    desktop.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', update);
      root.style.removeProperty('--mobile-cta-bar');
    };
  }, [ref, enabled, barKey]);
}
