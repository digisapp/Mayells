'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

// Without this boundary a failed server-component query leaves the admin
// area on an infinite skeleton; with it, failures surface fast with a retry.
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <div>
        <p className="font-medium">Something went wrong loading this page.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Usually transient — retrying almost always works.
        </p>
      </div>
      <Button onClick={reset}>Try Again</Button>
    </div>
  );
}
