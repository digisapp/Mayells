'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gavel,
  Image,
  Users,
  FileText,
  BarChart3,
  Package,
  Brain,
  Radio,
  Settings,
} from 'lucide-react';

const adminLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/auctions', label: 'Auctions', icon: Gavel },
  { href: '/admin/lots', label: 'Lots', icon: Image },
  { href: '/admin/consignments', label: 'Consignments', icon: Package },
  { href: '/admin/ai', label: 'AI Tools', icon: Brain },
  { href: '/admin/live', label: 'Live Auctions', icon: Radio },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border/50 bg-background min-h-screen p-4">
      <Link href="/" className="font-display text-xl tracking-wider block mb-2">
        MAYELLS
      </Link>
      <p className="text-xs text-muted-foreground mb-8 px-1">Admin Panel</p>

      <nav className="space-y-1">
        {adminLinks.map((link) => (
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
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
