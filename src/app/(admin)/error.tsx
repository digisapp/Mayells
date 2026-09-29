'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

// Without this boundary a failed server-component query leaves the admin
// area on an infinite skeleton; with it, failures surface fast with a retry.
// `retry` re-fetches the segment from the server (`reset` would only
// re-render the same failed payload).
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <div>
        <p className="font-medium">Something went wrong loading this page.</p>
        <p className="text-sm text-muted-foreground mt-1">
          If it was a brief connection problem, trying again will fix it. If it keeps happening, note the time and
          reference below.
        </p>
        {error.digest && <p className="text-xs text-muted-foreground mt-2 font-mono">Ref: {error.digest}</p>}
      </div>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
