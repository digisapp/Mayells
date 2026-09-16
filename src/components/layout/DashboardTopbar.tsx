'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Inbox, ShieldCheck, Radio } from 'lucide-react';
import { adminLinks, isActiveAdminLink } from '@/components/layout/AdminSidebar';
import { useAdminBadges } from '@/hooks/useAdminBadges';
import { cn } from '@/lib/utils';

export function DashboardTopbar() {
  const pathname = usePathname();
  const badges = useAdminBadges();

  const currentPage = adminLinks.find((link) => isActiveAdminLink(link.href, pathname));
  const unread = badges?.inbox.unread ?? 0;
  const live = badges?.auctions.live ?? 0;

  return (
    <header className="h-14 border-b border-border/50 bg-background flex items-center justify-between px-4 sm:px-6">
      {/* Mobile: show current page title (offset for hamburger button) */}
      <div className="lg:hidden pl-10">
        <span className="font-medium text-sm">{currentPage?.label || 'Admin'}</span>
      </div>

      <div className="hidden lg:flex items-center text-sm text-muted-foreground">
        {currentPage?.label ?? 'Admin'}
      </div>

      <div className="flex items-center gap-1.5">
        {live > 0 && (
          <Button asChild variant="ghost" size="sm" className="text-red-600 hover:text-red-700 text-xs gap-1.5">
            <Link href="/admin/live">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {live === 1 ? 'Live now' : `${live} live`}
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground text-xs gap-1.5 relative">
          <Link href="/admin/emails" aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}>
            <Inbox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inbox</span>
            {unread > 0 && (
              <span
                className={cn(
                  'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-medium leading-5 text-center tabular-nums',
                  'bg-champagne/40 text-charcoal',
                )}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground text-xs gap-1.5">
          <Link href="/admin/settings?tab=security" aria-label="Security settings">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Security</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
