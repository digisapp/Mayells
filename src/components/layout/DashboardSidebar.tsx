'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gavel,
  Trophy,
  Heart,
  FileText,
  Settings,
  Package,
  DollarSign,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const buyerLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bids', label: 'My Bids', icon: Gavel },
  { href: '/won', label: 'Won Lots', icon: Trophy },
  { href: '/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/invoices', label: 'Invoices', icon: FileText },
];

const sellerLinks = [
  { href: '/consign', label: 'Consignments', icon: Package },
  { href: '/payouts', label: 'Payouts', icon: DollarSign },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { isSeller } = useRole();

  return (
    <aside className="w-64 border-r border-border/50 bg-background min-h-screen p-4 hidden lg:block">
      <Link href="/" className="font-display text-xl tracking-wider block mb-8">
        MAYELLS
      </Link>

      <nav className="space-y-1">
        {buyerLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === link.href
                ? 'bg-accent/20 text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/10',
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        ))}

        {isSeller && (
          <>
            <div className="pt-4 pb-2 px-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Selling
              </span>
            </div>
            {sellerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname === link.href
                    ? 'bg-accent/20 text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/10',
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="absolute bottom-4 left-4 right-4 space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-accent/20 text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/10',
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
