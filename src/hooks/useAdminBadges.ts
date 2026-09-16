'use client';

import { useEffect, useState } from 'react';

import type { AdminBadges } from '@/lib/admin/badges';

export type { AdminBadges };

const POLL_MS = 60_000;

let cached: AdminBadges | null = null;
let cachedAt = 0;
const listeners = new Set<(b: AdminBadges | null) => void>();
let inFlight: Promise<void> | null = null;

async function refresh(force = false) {
  if (!force && Date.now() - cachedAt < 5_000) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/admin/badges', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as AdminBadges;
      cached = data;
      cachedAt = Date.now();
      listeners.forEach((l) => l(data));
    } catch {
      // Badge counts are decoration; never surface a failure.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Sidebar / topbar badge counts. One shared poll for every subscriber on the
 * page (sidebar, topbar, dashboard) — refreshed every minute and whenever the
 * tab regains focus. Call `refreshAdminBadges()` after an action that should
 * change a count (e.g. archiving an email).
 */
export function useAdminBadges(): AdminBadges | null {
  const [badges, setBadges] = useState<AdminBadges | null>(cached);

  useEffect(() => {
    listeners.add(setBadges);
    refresh();
    const timer = setInterval(() => refresh(true), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      listeners.delete(setBadges);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return badges;
}

export function refreshAdminBadges() {
  return refresh(true);
}
