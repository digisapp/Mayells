'use client';

import { useEffect } from 'react';
import { sendMicrositeEvent } from '@/lib/microsites/beacon';

/** Records one page view per load for the admin Microsites page. */
export function MicrositeTracker({ site }: { site: string }) {
  useEffect(() => {
    sendMicrositeEvent(site, 'view');
  }, [site]);
  return null;
}
