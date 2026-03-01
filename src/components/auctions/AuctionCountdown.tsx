'use client';

import { useEffect, useState } from 'react';

interface AuctionCountdownProps {
  endsAt: Date;
  onExpired?: () => void;
  className?: string;
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

export function AuctionCountdown({ endsAt, onExpired, className }: AuctionCountdownProps) {
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
    return <span className={className}>Ended</span>;
  }

  const isUrgent = time.total < 5 * 60 * 1000; // Under 5 minutes

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className={`flex items-center gap-1 tabular-nums ${isUrgent ? 'text-destructive animate-pulse' : ''} ${className ?? ''}`}>
      {time.days > 0 && (
        <span>{time.days}d </span>
      )}
      <span>{pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}</span>
    </div>
  );
}
