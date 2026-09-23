'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import { adminBreadcrumbs } from '@/components/layout/admin-nav';
import { CommandMenu } from '@/components/admin/CommandMenu';
import { useAdminBadges } from '@/hooks/useAdminBadges';

export function DashboardTopbar() {
  const pathname = usePathname();
  const badges = useAdminBadges();
  const crumbs = adminBreadcrumbs(pathname);
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const live = badges?.auctions.live ?? 0;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/50 bg-background/95 backdrop-blur flex items-center justify-between gap-3 px-4 sm:px-6">
      {/* Phones: a back arrow to the parent and the current page (offset for the hamburger). */}
      <div className="lg:hidden pl-10 flex items-center gap-1 min-w-0">
        {parent && (
          <Link href={parent.href} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label={`Back to ${parent.label}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        )}
        <span className="font-medium text-sm truncate">{crumbs[crumbs.length - 1].label}</span>
      </div>

      <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
              {last ? (
                <span className="text-foreground truncate" aria-current="page">{c.label}</span>
              ) : (
                <Link href={c.href} className="text-muted-foreground hover:text-foreground truncate">{c.label}</Link>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        {live > 0 && (
          <Button asChild variant="ghost" size="sm" className="text-red-600 hover:text-red-700 text-xs gap-1.5">
            <Link href="/admin/live">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {live === 1 ? 'Live now' : `${live} live`}
            </Link>
          </Button>
        )}
        <CommandMenu />
      </div>
    </header>
  );
}
