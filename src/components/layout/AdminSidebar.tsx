'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Gavel,
  Image,
  Users,
  Users2,
  FileText,
  BarChart3,
  Package,
  Brain,
  Radio,
  Mail,
  FileSignature,
  ClipboardCheck,
  MessageSquare,
  Settings,
} from 'lucide-react';

const adminLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/auctions', label: 'Auctions', icon: Gavel },
  { href: '/admin/lots', label: 'Lots', icon: Image },
  { href: '/admin/consignments', label: 'Consignments', icon: Package },
  { href: '/admin/inquiries', label: 'Inquiries', icon: MessageSquare },
  { href: '/admin/clients', label: 'Clients', icon: Users2 },
  { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck },
  { href: '/admin/ai', label: 'AI Tools', icon: Brain },
  { href: '/admin/live', label: 'Live Auctions', icon: Radio },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/outreach', label: 'Outreach', icon: Mail },
  { href: '/admin/agreements', label: 'Agreements', icon: FileSignature },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border/50 bg-background min-h-screen p-4 relative">
      <Link href="/" className="font-logo text-xl block mb-2">
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
          href="/admin"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
