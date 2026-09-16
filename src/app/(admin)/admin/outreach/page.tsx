import { Suspense } from 'react';
import { OutreachClient } from './outreach-client';

export const dynamic = 'force-dynamic';

/**
 * The list is fetched client-side from /api/admin/outreach with server-side
 * filters and 50-row pages (it used to preload 500 rows and filter in the
 * browser). useSearchParams in the client needs the Suspense boundary.
 */
export default function AdminOutreachPage() {
  return (
    <Suspense fallback={<div className="h-24 bg-muted animate-pulse rounded-lg" />}>
      <OutreachClient />
    </Suspense>
  );
}
