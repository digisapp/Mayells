'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gavel,
  Image,
  Users,
  Users2,
  UserPlus,
  FileText,
  BarChart3,
  Package,
  Brain,
  Radio,
  Mail,
  Inbox,
  FileSignature,
  ClipboardCheck,
  MessageSquare,
  Settings,
  Truck,
  SlidersHorizontal,
  Menu,
  X,
} from 'lucide-react';

const adminLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/auctions', label: 'Auctions', icon: Gavel },
  { href: '/admin/lots', label: 'Lots', icon: Image },
  { href: '/admin/prospects', label: 'Prospects', icon: UserPlus },
  { href: '/admin/consignments', label: 'Consignments', icon: Package },
  { href: '/admin/inquiries', label: 'Inquiries', icon: MessageSquare },
  { href: '/admin/clients', label: 'Clients', icon: Users2 },
  { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck },
  { href: '/admin/ai', label: 'AI Tools', icon: Brain },
  { href: '/admin/live', label: 'Live Auctions', icon: Radio },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/shipments', label: 'Shipments', icon: Truck },
  { href: '/admin/outreach', label: 'Outreach', icon: Mail },
  { href: '/admin/emails', label: 'Email', icon: Inbox },
  { href: '/admin/agreements', label: 'Agreements', icon: FileSignature },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/automation', label: 'Automation', icon: SlidersHorizontal },
];

export { adminLinks };

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <Link href="/" className="font-logo text-xl block mb-2">
        MAYELLS
      </Link>
      <p className="text-xs text-muted-foreground mb-8 px-1">Admin Panel</p>

      <nav className="space-y-1">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              (link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href))
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
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Back to Site
        </Link>
      </div>
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-background border border-border/50 shadow-sm"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-64 border-r border-border/50 bg-background p-4 relative transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 border-r border-border/50 bg-background min-h-screen p-4 relative shrink-0">
        <SidebarContent pathname={pathname} />
      </aside>
    </>
  );
}
