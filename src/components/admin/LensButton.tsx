'use client';

import { ScanSearch } from 'lucide-react';
import { cn } from '@/lib/utils';

// Google Lens has no API, but its uploadbyurl deep link accepts any publicly
// reachable image URL — our Supabase storage URLs qualify. Free, and better
// results than any scraped Lens service.
export function lensUrl(imageUrl: string): string {
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Opens the image in Google Lens in a new tab so admins can visually identify
 * an item and find real comparable listings before finalizing an appraisal.
 *
 * Rendered as an anchor (not a Button) so it can sit inside clickable cards
 * without nesting interactive elements; stopPropagation keeps the card's own
 * onClick from firing.
 */
export function LensButton({
  imageUrl,
  variant = 'button',
  className,
}: {
  imageUrl: string;
  variant?: 'button' | 'overlay';
  className?: string;
}) {
  return (
    <a
      href={lensUrl(imageUrl)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Search this photo on Google Lens"
      className={cn(
        variant === 'button'
          ? 'inline-flex items-center gap-1.5 h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors'
          : 'inline-flex items-center justify-center h-6 w-6 rounded bg-black/60 text-white hover:bg-black/80 transition-colors',
        className
      )}
    >
      <ScanSearch className="h-3 w-3" />
      {variant === 'button' && 'Lens'}
    </a>
  );
}
