'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Bell, ExternalLink } from 'lucide-react';

export function DashboardTopbar() {
  return (
    <header className="h-16 border-b border-border/50 bg-background flex items-center justify-between px-6">
      <div className="lg:hidden">
        <Link href="/" className="font-logo text-xl">
          MAYELLS
        </Link>
      </div>

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
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
