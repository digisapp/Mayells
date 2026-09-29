import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Previous / Next pagination row shared by the admin list pages. Pass
 * callbacks for client-side lists, or hrefs for server-rendered ones.
 * Renders nothing for a single page.
 */
export function Pager({
  page,
  totalPages,
  onPageChange,
  hrefFor,
  summary,
}: {
  page: number;
  totalPages: number;
  onPageChange?: (next: number) => void;
  /** Server pages: the URL for a given page number. */
  hrefFor?: (page: number) => string;
  /** Replaces the default "Page X of Y" line. */
  summary?: React.ReactNode;
}) {
  if (totalPages <= 1) return null;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const control = (target: number, enabled: boolean, children: React.ReactNode) =>
    hrefFor && enabled ? (
      <Button asChild size="sm" variant="outline" className="gap-1">
        <Link href={hrefFor(target)}>{children}</Link>
      </Button>
    ) : (
      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={!enabled}
        // Server pages render this without a handler (disabled end of range).
        onClick={onPageChange ? () => onPageChange(target) : undefined}
      >
        {children}
      </Button>
    );

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
      <p className="text-muted-foreground">{summary ?? <>Page {page} of {totalPages}</>}</p>
      <div className="flex gap-2">
        {control(page - 1, hasPrev, <><ChevronLeft className="h-3.5 w-3.5" /> Previous</>)}
        {control(page + 1, hasNext, <>Next <ChevronRight className="h-3.5 w-3.5" /></>)}
      </div>
    </nav>
  );
}
