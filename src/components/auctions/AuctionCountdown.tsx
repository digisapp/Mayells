'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface AuctionCountdownProps {
  endsAt: Date;
  onExpired?: () => void;
  className?: string;
  /** `compact` is the one-line form for tight spots (the phone bid bar): "2d 4h", "4h 12m", "12:05". */
  variant?: 'inline' | 'card' | 'compact';
  /**
   * The server's clock (ms since epoch) captured when the page was rendered.
   * When provided, the countdown corrects for client clock skew so a device
   * whose clock is wrong doesn't show the wrong time-to-close — critical during
   * anti-snipe in the final seconds. Without it, falls back to the local clock.
   */
  serverNow?: number;
  /**
   * A measured server-minus-device offset (ms), e.g. from a poll corrected by
   * half its round trip. Takes precedence over `serverNow`, whose mount-time
   * estimate over-reads by the network and hydration delay.
   */
  clockOffsetMs?: number | null;
}

function getTimeRemaining(endTime: Date, nowMs: number) {
  const total = endTime.getTime() - nowMs;
  if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

export function AuctionCountdown({ endsAt, onExpired, className, variant = 'inline', serverNow, clockOffsetMs }: AuctionCountdownProps) {
  // Initialized to null and computed after mount: calling Date.now() during
  // render would produce different output on server vs client (hydration mismatch).
  const [time, setTime] = useState<ReturnType<typeof getTimeRemaining> | null>(null);

  // The clock-skew offset must be measured EXACTLY ONCE (against the original
  // serverNow), not recomputed each time the effect re-runs — otherwise a
  // parent re-render (e.g. LiveLotPanel's 6s poll) would recompute skew with a
  // fresh Date.now() but the same fixed serverNow, pinning "now" back to page
  // load and making the countdown freeze/jump backwards. A ref survives renders.
  const skewRef = useRef<number | null>(null);
  // Hold the latest onExpired in a ref so it isn't an effect dependency (a new
  // inline arrow on every parent render must not tear down the interval). The
  // ref is refreshed in an effect — never assigned during render.
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  // Depend on the close time's numeric value, not the Date object identity, so
  // the effect only re-runs when the actual deadline changes (anti-snipe
  // extension), not on every unrelated re-render.
  const endsAtMs = endsAt.getTime();

  useEffect(() => {
    if (skewRef.current === null) {
      skewRef.current = serverNow != null ? serverNow - Date.now() : 0;
    }
    const skew = clockOffsetMs ?? skewRef.current;
    let expired = false;

    const tick = () => {
      if (expired) return;
      const correctedNow = Date.now() + skew;
      const remaining = getTimeRemaining(new Date(endsAtMs), correctedNow);
      setTime(remaining);
      if (remaining.total <= 0) {
        expired = true;
        clearInterval(timer);
        onExpiredRef.current?.();
      }
    };

    const timer = setInterval(tick, 1000);
    // First update is deferred to the next frame so hydration completes
    // against the stable placeholder before any client-clock value renders.
    const raf = requestAnimationFrame(tick);
    // Timers are frozen while a phone is locked; catch up the moment it wakes
    // instead of showing the pre-lock time for up to a second.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAtMs, serverNow, clockOffsetMs]);

  if (variant === 'compact') {
    return <CompactCountdown time={time} className={className} />;
  }

  if (!time) {
    return (
      <div className={`flex items-center gap-1.5 tabular-nums font-medium text-foreground ${className ?? ''}`}>
        <Clock className={variant === 'card' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        <span className="tracking-tight">--:--:--</span>
      </div>
    );
  }

  if (time.total <= 0) {
    return <span className={`text-muted-foreground ${className ?? ''}`}>Auction Ended</span>;
  }

  const isUrgent = time.total < 5 * 60 * 1000;
  const isWarning = time.total < 30 * 60 * 1000;
  const pad = (n: number) => n.toString().padStart(2, '0');

  const urgencyColor = isUrgent
    ? 'text-red-500'
    : isWarning
      ? 'text-amber-500'
      : 'text-foreground';

  if (variant === 'card') {
    return (
      <div className={`flex items-center gap-3 ${isUrgent ? 'animate-urgency' : ''} ${className ?? ''}`}>
        <Clock className={`h-4 w-4 ${urgencyColor}`} />
        <div className="flex items-center gap-1.5">
          {time.days > 0 && (
            <TimeUnit value={time.days} label="d" urgencyColor={urgencyColor} />
          )}
          <TimeUnit value={time.hours} label="h" urgencyColor={urgencyColor} />
          <span className={`text-lg font-light ${urgencyColor}`}>:</span>
          <TimeUnit value={time.minutes} label="m" urgencyColor={urgencyColor} />
          <span className={`text-lg font-light ${urgencyColor}`}>:</span>
          <TimeUnit value={time.seconds} label="s" urgencyColor={urgencyColor} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 tabular-nums font-medium ${urgencyColor} ${isUrgent ? 'animate-urgency' : ''} ${className ?? ''}`}>
      <Clock className="h-3.5 w-3.5" />
      {time.days > 0 && <span>{time.days}d </span>}
      <span className="tracking-tight">{pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}</span>
    </div>
  );
}

function TimeUnit({ value, label, urgencyColor }: { value: number; label: string; urgencyColor: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className={`text-xl font-semibold tabular-nums tracking-tight ${urgencyColor}`}>
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function CompactCountdown({ time, className }: { time: ReturnType<typeof getTimeRemaining> | null; className?: string }) {
  if (time && time.total <= 0) {
    return <span className={`text-muted-foreground ${className ?? ''}`}>Closing</span>;
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  const isUrgent = !!time && time.total < 5 * 60 * 1000;
  const isWarning = !!time && time.total < 30 * 60 * 1000;
  const label = !time
    ? '--:--'
    : time.days > 0
      ? `${time.days}d ${time.hours}h`
      : time.hours > 0
        ? `${time.hours}h ${pad(time.minutes)}m`
        : `${pad(time.minutes)}:${pad(time.seconds)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums font-medium ${
        isUrgent ? 'text-red-500' : isWarning ? 'text-amber-600' : 'text-foreground'
      } ${className ?? ''}`}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
