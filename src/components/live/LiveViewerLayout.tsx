'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { formatCurrency } from '@/types';
import { cn } from '@/lib/utils';
import { ChatReactions, LiveChatPanel, type LiveChatState } from './LiveChat';
import { LiveBidSheet, LiveLotSummary } from './LiveLotSummary';
import { pickCurrentLot, type LiveLot, type LiveViewer } from './live-lots';

interface LiveViewerLayoutProps {
  auction: { id: string; title: string; slug: string; buyerPremiumPercent: number | null };
  lots: LiveLot[];
  viewer: LiveViewer;
  chat: LiveChatState;
  signInHref: string;
  /** The stream (LiveVideoPlayer); sized by the stage cell. */
  video: ReactNode;
  onBidPlaced: () => void;
}

type PhoneTab = 'chat' | 'lots';

// Phone landscape = narrower than the desktop breakpoint and wider than tall.
// Every `max-lg:landscape:` class below belongs to that arrangement.
const LANDSCAPE_SIDE = 'max-lg:landscape:col-start-2 max-lg:landscape:border-l max-lg:landscape:border-border';

/**
 * The saleroom: a fixed, full-viewport grid that never scrolls as a page
 * (only the chat and lot list scroll, each contained).
 *
 * - Portrait phone: stream (16:9) → current lot + bid → Chat/Lots tabs → the
 *   active panel, whose composer sits on the bottom edge.
 * - Landscape phone: stream fills the height on the left; lot, bid and the
 *   tabbed chat/lots in a side panel that can be hidden for a bigger picture.
 * - Desktop: stream, lot and lot grid on the left; chat down the right.
 */
export function LiveViewerLayout({ auction, lots, viewer, chat, signInHref, video, onBidPlaced }: LiveViewerLayoutProps) {
  // null = follow the lot on the block as the sale moves on.
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [tab, setTab] = useState<PhoneTab>('chat');
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [bidSheet, setBidSheet] = useState<{ open: boolean; lotId: string | null }>({ open: false, lotId: null });

  const currentLot = pickCurrentLot(lots);
  const activeLot = (selectedLotId && lots.find((l) => l.id === selectedLotId)) || currentLot;
  const sideHidden = !sidePanelOpen && 'max-lg:landscape:hidden';

  return (
    <div
      // iOS pans the page to lift the chat input above the keyboard and can
      // leave it offset once the keyboard closes. This page never scrolls, so
      // put it back — unless focus moved to another field (keyboard still up).
      onBlur={() => {
        setTimeout(() => {
          const el = document.activeElement;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
          if (window.scrollY !== 0) window.scrollTo(0, 0);
        }, 150);
      }}
      className="dark fixed inset-0 flex flex-col overflow-hidden bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-foreground scheme-dark"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 pl-4 pr-2 max-lg:landscape:h-11">
        <span className="shrink-0 font-logo text-base text-champagne">MAYELLS</span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white">
          <span aria-hidden className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
          Live
        </span>
        <h1 className="min-w-0 flex-1 truncate text-sm text-foreground/70">{auction.title}</h1>
        <span className="hidden shrink-0 text-sm text-muted-foreground lg:inline">{lots.length} lots</span>
        <Link
          href={`/auctions/${auction.slug}`}
          className="flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X aria-hidden className="size-4" />
          Exit
        </Link>
      </header>

      <main
        id="main-content"
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_auto_minmax(0,1fr)]',
          sidePanelOpen
            ? 'max-lg:landscape:grid-cols-[minmax(0,1fr)_18rem]'
            : 'max-lg:landscape:grid-cols-[minmax(0,1fr)]',
          'max-lg:landscape:grid-rows-[auto_auto_minmax(0,1fr)]',
          'lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_24rem]',
        )}
      >
        {/* Stage */}
        <div
          className={cn(
            'relative col-start-1 row-start-1 aspect-video w-full overflow-hidden bg-black',
            'max-lg:landscape:row-span-full max-lg:landscape:aspect-auto max-lg:landscape:min-h-0',
            'lg:max-h-[62dvh]',
          )}
        >
          {video}

          <button
            type="button"
            onClick={() => setSidePanelOpen((open) => !open)}
            aria-expanded={sidePanelOpen}
            aria-label={sidePanelOpen ? 'Hide lot and chat' : 'Show lot and chat'}
            className="absolute right-2 top-2 z-20 hidden size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-champagne max-lg:landscape:flex"
          >
            {sidePanelOpen ? <PanelRightClose aria-hidden className="size-5" /> : <PanelRightOpen aria-hidden className="size-5" />}
          </button>

          {/* With the panel hidden, keep the essentials on the picture. */}
          {!sidePanelOpen && activeLot && (
            <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-10 hidden max-w-[40%] rounded-lg bg-black/60 px-3 py-2 text-white backdrop-blur-sm max-lg:landscape:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">Lot {activeLot.lotNumber}</p>
              <p className="truncate font-display text-base text-champagne">
                {activeLot.currentBidAmount > 0 ? formatCurrency(activeLot.currentBidAmount) : 'No bids yet'}
              </p>
            </div>
          )}
        </div>

        {/* Current lot + bid */}
        {activeLot && (
          <LiveLotSummary
            lot={activeLot}
            onTheBlock={activeLot.id === currentLot?.id}
            signedIn={viewer.signedIn}
            signInHref={signInHref}
            onBid={() => setBidSheet({ open: true, lotId: activeLot.id })}
            className={cn(
              'col-start-1 row-start-2 border-b border-border',
              LANDSCAPE_SIDE,
              'max-lg:landscape:row-start-1',
              'lg:border-b-0 lg:border-t',
              sideHidden,
            )}
          />
        )}

        {/* Phone tabs */}
        <div
          className={cn(
            'col-start-1 row-start-3 flex items-center justify-between gap-1 border-b border-border px-2 lg:hidden',
            LANDSCAPE_SIDE,
            'max-lg:landscape:row-start-2',
            sideHidden,
          )}
        >
          <div className="flex" role="group" aria-label="Panel">
            <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
              Chat
              <span
                aria-hidden
                className={cn('size-1.5 rounded-full', chat.connected ? 'bg-green-500' : 'bg-amber-400')}
              />
            </TabButton>
            <TabButton active={tab === 'lots'} onClick={() => setTab('lots')}>
              Lots <span className="text-muted-foreground">{lots.length}</span>
            </TabButton>
          </div>
          {tab === 'chat' && viewer.signedIn && (
            <ChatReactions onReact={(emoji) => chat.sendMessage(emoji, 'reaction')} />
          )}
        </div>

        {/* Chat */}
        <section
          aria-label="Live chat"
          className={cn(
            'col-start-1 row-start-4 flex min-h-0 flex-col',
            LANDSCAPE_SIDE,
            'max-lg:landscape:row-start-3',
            'lg:col-start-2 lg:row-span-full lg:border-l lg:border-border',
            tab === 'chat' ? '' : 'max-lg:hidden',
            sideHidden,
          )}
        >
          <LiveChatPanel
            chat={chat}
            signedIn={viewer.signedIn}
            signInHref={signInHref}
            headerClassName="hidden lg:flex"
            reactionsClassName="hidden lg:flex"
            reportsMobileBar
            className="flex-1"
          />
        </section>

        {/* Lot navigator */}
        <section
          aria-label="Lots in this sale"
          className={cn(
            'col-start-1 row-start-4 min-h-0 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
            LANDSCAPE_SIDE,
            'max-lg:landscape:row-start-3',
            'lg:row-start-3 lg:border-t lg:border-border lg:p-4',
            tab === 'lots' ? '' : 'max-lg:hidden',
            sideHidden,
          )}
        >
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 max-lg:landscape:grid-cols-3 md:grid-cols-8">
            {lots.map((lot) => {
              const active = lot.id === activeLot?.id;
              const onBlock = lot.id === currentLot?.id && lot.phase === 'open';
              const settled = lot.phase === 'sold' || lot.phase === 'passed';
              return (
                <button
                  key={lot.id}
                  type="button"
                  // Tapping the lot on the block goes back to following the sale.
                  onClick={() => setSelectedLotId(lot.id === currentLot?.id ? null : lot.id)}
                  aria-pressed={active}
                  aria-label={`Lot ${lot.lotNumber}: ${lot.title}${onBlock ? ' (on the block)' : ''}`}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded border-2 transition-colors',
                    active ? 'border-champagne' : 'border-transparent hover:border-white/20',
                  )}
                >
                  {lot.imageUrl ? (
                    <Image
                      src={lot.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 10vw, (min-width: 640px) 16vw, 25vw"
                      className={cn('object-cover', settled && 'opacity-50')}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-white/5 text-sm text-white/40">
                      {lot.lotNumber}
                    </span>
                  )}
                  {onBlock && (
                    <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                      <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
                      Live
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[11px] text-white/90">
                    Lot {lot.lotNumber}
                    {lot.phase === 'sold' && ' · Sold'}
                  </span>
                </button>
              );
            })}
          </div>
          {lots.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No lots in this sale yet.</p>}
        </section>
      </main>

      <LiveBidSheet
        lot={lots.find((l) => l.id === bidSheet.lotId)}
        buyerPremiumPercent={auction.buyerPremiumPercent}
        open={bidSheet.open}
        onOpenChange={(open) => setBidSheet((s) => ({ ...s, open }))}
        onBidPlaced={onBidPlaced}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn('absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-champagne transition-opacity', active ? 'opacity-100' : 'opacity-0')}
      />
    </button>
  );
}
