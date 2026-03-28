'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { adminLinks } from '@/components/layout/AdminSidebar';

export function DashboardTopbar() {
  const pathname = usePathname();

  // Find current page label from sidebar links
  const currentPage = adminLinks.find((link) =>
    link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href)
  );

  return (
    <header className="h-16 border-b border-border/50 bg-background flex items-center justify-between px-6">
      {/* Mobile: show current page title (offset for hamburger button) */}
      <div className="lg:hidden pl-10">
        <span className="font-medium text-sm">{currentPage?.label || 'Admin'}</span>
      </div>

      {/* Desktop: back to site link */}
      <div className="hidden lg:flex items-center">
        <Link
          href="/"
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Back to site
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/admin/emails">
          <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
            Inbox
          </Button>
        </Link>
      </div>
    </header>
  );
}
