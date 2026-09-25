'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useConnectionState,
  useRoomContext,
  useStartAudio,
  useTracks,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, Track } from 'livekit-client';
import { Maximize, Minimize, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isStageFullscreen, toggleStageFullscreen } from './fullscreen';

// No '@livekit/components-styles': it is unlayered CSS, so it beat our
// Tailwind classes — the video was forced to object-fit: cover and, under
// 600px, the "Tap for sound" button was pinned fixed to the middle of the
// screen over the lot and chat.

type JoinState =
  | { status: 'joining' }
  | { status: 'ready'; token: string }
  | { status: 'failed'; reason: 'signed-out' | 'not-live' | 'unavailable' };

interface LiveVideoPlayerProps {
  auctionId: string;
  signedIn: boolean;
  signInHref: string;
  /** LiveKit server; unset (e.g. locally without keys) shows a quiet "unavailable" stage. */
  serverUrl?: string;
  className?: string;
}

/** Automatic rejoins before we stop and offer a manual retry. */
const MAX_AUTO_REJOINS = 4;

export function LiveVideoPlayer({
  auctionId,
  signedIn,
  signInHref,
  serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL,
  className,
}: LiveVideoPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [join, setJoin] = useState<JoinState>({ status: 'joining' });
  // Bumped to fetch a fresh token and mount a fresh room.
  const [attempt, setAttempt] = useState(0);
  const [dropped, setDropped] = useState(false);
  const rejoins = useRef(0);

  useEffect(() => {
    if (!signedIn || !serverUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/live/${auctionId}/token`, { method: 'POST' });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setJoin({ status: 'ready', token: data.token });
          return;
        }
        setJoin({
          status: 'failed',
          reason: res.status === 401 ? 'signed-out' : res.status === 400 || res.status === 404 ? 'not-live' : 'unavailable',
        });
      } catch {
        if (!cancelled) setJoin({ status: 'failed', reason: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auctionId, signedIn, serverUrl, attempt]);

  // A dropped room (phone locked, network change, LiveKit giving up) is
  // rejoined with a fresh token, but only once the page is visible again —
  // a backgrounded iPhone tab can't hold a connection anyway. Backs off, and
  // hands over to a manual retry if the server keeps refusing.
  useEffect(() => {
    if (!dropped) return;
    const delay = Math.min(1000 * 2 ** rejoins.current, 15000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rejoin = () => {
      if (document.visibilityState !== 'visible' || timer) return;
      timer = setTimeout(() => {
        rejoins.current += 1;
        setDropped(false);
        setJoin({ status: 'joining' });
        setAttempt((n) => n + 1);
      }, delay);
    };
    rejoin();
    document.addEventListener('visibilitychange', rejoin);
    return () => {
      document.removeEventListener('visibilitychange', rejoin);
      if (timer) clearTimeout(timer);
    };
  }, [dropped]);

  const onDrop = useCallback(() => {
    if (rejoins.current >= MAX_AUTO_REJOINS) setJoin({ status: 'failed', reason: 'unavailable' });
    else setDropped(true);
  }, []);

  const retry = () => {
    rejoins.current = 0;
    setJoin({ status: 'joining' });
    setAttempt((n) => n + 1);
  };

  let content: ReactNode;
  if (!signedIn || (join.status === 'failed' && join.reason === 'signed-out')) {
    content = (
      <StageMessage
        title="Sign in to watch the sale live"
        detail="Registered bidders can watch, bid and chat."
        action={
          <Button asChild className="h-11 px-6">
            <Link href={signInHref}>Sign in</Link>
          </Button>
        }
      />
    );
  } else if (!serverUrl || (join.status === 'failed' && join.reason === 'unavailable')) {
    content = (
      <StageMessage
        title="The live video isn't available right now"
        detail="Bidding and chat still work."
        action={
          serverUrl ? (
            <Button variant="outline" onClick={retry} className="h-11 px-6">
              Try again
            </Button>
          ) : null
        }
      />
    );
  } else if (join.status === 'failed') {
    content = <StageMessage title="This sale is no longer live" />;
  } else if (join.status === 'joining' || dropped) {
    content = <StageMessage busy title={dropped ? 'Reconnecting…' : 'Joining the saleroom…'} />;
  } else {
    content = (
      <LiveKitRoom
        key={attempt}
        token={join.token}
        serverUrl={serverUrl}
        connect
        // Let LiveKit pick the stream size for the element (saves mobile data)
        // and pause video while the page is hidden.
        options={{ adaptiveStream: true }}
        onConnected={() => {
          rejoins.current = 0;
        }}
        onDisconnected={(reason) => {
          if (reason !== DisconnectReason.CLIENT_INITIATED) onDrop();
        }}
        onError={onDrop}
        className="absolute inset-0"
      >
        <LiveKitStageContent stageRef={stageRef} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    );
  }

  return (
    <LiveStage ref={stageRef} className={className}>
      {content}
    </LiveStage>
  );
}

function LiveKitStageContent({ stageRef }: { stageRef: RefObject<HTMLDivElement | null> }) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const { canPlayAudio } = useStartAudio({ room, props: NO_PROPS });
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoTrack = tracks.find(
    (t) => t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare,
  );

  let body: ReactNode;
  if (connectionState !== ConnectionState.Connected) {
    body = <StageMessage busy title={connectionState === ConnectionState.Connecting ? 'Joining the saleroom…' : 'Reconnecting…'} />;
  } else if (!videoTrack) {
    body = <StageMessage live title="Waiting for the auctioneer's video…" />;
  } else {
    body = (
      <>
        {/* LiveKit attaches the stream with playsInline + muted (sound comes
            from RoomAudioRenderer), so iOS plays it inline. */}
        <VideoTrack ref={videoRef} trackRef={videoTrack} className="absolute inset-0 h-full w-full object-contain" />
        <LivePill />
        <FullscreenButton stageRef={stageRef} videoRef={videoRef} />
      </>
    );
  }

  return (
    <>
      {body}
      {connectionState === ConnectionState.Connected && !canPlayAudio && (
        <SoundButton onClick={() => room.startAudio().catch(() => {})} />
      )}
    </>
  );
}

const NO_PROPS = {};

// ─── Presentational pieces ───────────────────────────────────────────────────

/**
 * The black box the stream and its overlays live in, and the fullscreen
 * target. It fills its positioned parent (the layout's stage cell) absolutely:
 * WebKit resolves a percentage height against an aspect-ratio box before its
 * max-height clamp, so h-full spilled past a capped desktop stage.
 */
export function LiveStage({
  ref,
  className,
  children,
}: {
  ref?: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div ref={ref} className={cn('absolute inset-0 overflow-hidden bg-black text-white', className)}>
      {children}
    </div>
  );
}

export function StageMessage({
  title,
  detail,
  action,
  busy = false,
  live = false,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  busy?: boolean;
  live?: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center" role="status">
      {busy && (
        <span aria-hidden className="size-7 rounded-full border-2 border-champagne border-t-transparent motion-safe:animate-spin" />
      )}
      {live && (
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-champagne/10">
          <span className="size-2.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
        </span>
      )}
      <div>
        <p className="font-display text-base text-white sm:text-lg">{title}</p>
        {detail && <p className="mt-1 text-sm text-white/60">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function LivePill() {
  return (
    <span className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white backdrop-blur-sm">
      <span aria-hidden className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
      Live
    </span>
  );
}

/**
 * Shown only while the browser (iOS Safari especially) blocks autoplaying
 * sound. Centred along the bottom edge, above everything else on the stage,
 * so no other control can cover it.
 */
export function SoundButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-5 text-sm font-medium text-white shadow-lg ring-1 ring-champagne/60 backdrop-blur-sm transition-colors hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne landscape:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <Volume2 aria-hidden className="size-4 text-champagne" />
      Tap for sound
    </button>
  );
}

const subscribeNever = () => () => {};

function fullscreenAvailable(): boolean {
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled || 'webkitEnterFullscreen' in HTMLVideoElement.prototype);
}

export function FullscreenButton({
  stageRef,
  videoRef,
}: {
  stageRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const available = useSyncExternalStore(subscribeNever, fullscreenAvailable, () => false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(isStageFullscreen(document, stageRef.current));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [stageRef]);

  if (!available) return null;
  const Icon = active ? Minimize : Maximize;
  return (
    <button
      type="button"
      onClick={() => toggleStageFullscreen(stageRef.current, videoRef.current)}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      className="absolute bottom-2 right-2 z-20 flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-champagne landscape:bottom-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
