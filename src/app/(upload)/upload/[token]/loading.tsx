import { Loader2 } from 'lucide-react';

// Same as the page's own first frame, so opening the link from an email goes
// straight from this to the page with no jump (the site-wide loader would
// flash a different design first).
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-7 w-7 animate-spin text-champagne-deep mx-auto mb-4" />
        <p className="text-charcoal/60 text-sm">Opening your upload page…</p>
      </div>
    </div>
  );
}
