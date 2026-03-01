'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface AuctionCountdownProps {
  endsAt: Date;
  onExpired?: () => void;
  className?: string;
  variant?: 'inline' | 'card';
}

function getTimeRemaining(endTime: Date) {
  const total = endTime.getTime() - Date.now();
  if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

export function AuctionCountdown({ endsAt, onExpired, className, variant = 'inline' }: AuctionCountdownProps) {
  const [time, setTime] = useState(getTimeRemaining(endsAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = getTimeRemaining(endsAt);
      setTime(remaining);
      if (remaining.total <= 0) {
        clearInterval(timer);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endsAt, onExpired]);

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
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
