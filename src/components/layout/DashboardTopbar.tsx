'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bell, Search } from 'lucide-react';

export function DashboardTopbar() {
  const { profile } = useAuth();
  const initials = profile?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <header className="h-16 border-b border-border/50 bg-background flex items-center justify-between px-6">
      <div className="lg:hidden">
        <Link href="/" className="font-display text-xl tracking-wider">
          MAYELLS
        </Link>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Link href="/search">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Search className="h-5 w-5" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-accent/20 text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
