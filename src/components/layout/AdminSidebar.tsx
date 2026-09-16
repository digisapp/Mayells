'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdminBadges, type AdminBadges } from '@/hooks/useAdminBadges';
import {
  LayoutDashboard,
  Gavel,
  Image,
  Users,
  UserPlus,
  FileText,
  BarChart3,
  Brain,
  Radio,
  Mail,
  Inbox,
  ClipboardCheck,
  Truck,
  Banknote,
  Settings,
  Webhook,
  Menu,
  X,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';

export interface AdminLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which badge count to show next to the item, if any. */
  badge?: (b: AdminBadges) => number;
  /** Amber (attention) vs red (problem) badge. */
  badgeTone?: 'attention' | 'problem';
}

export interface AdminNavGroup {
  label: string | null;
  links: AdminLink[];
}

// Ordered the way work flows through the house: intake → catalogue → sale →
// settlement → people → reporting → system.
export const adminNav: AdminNavGroup[] = [
  {
    label: null,
    links: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Intake',
    links: [
      { href: '/admin/prospects', label: 'Prospects', icon: UserPlus, badge: (b) => b.prospects.awaiting + b.prospects.signed },
      { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck, badge: (b) => b.appraisals.review },
    ],
  },
  {
    label: 'Catalogue & Sales',
    links: [
      { href: '/admin/lots', label: 'Lots', icon: Image, badge: (b) => b.lots.pendingReview },
      { href: '/admin/auctions', label: 'Auctions', icon: Gavel, badge: (b) => b.auctions.settling },
      { href: '/admin/live', label: 'Live Console', icon: Radio, badge: (b) => b.auctions.live, badgeTone: 'problem' },
      { href: '/admin/ai', label: 'AI Tools', icon: Brain },
    ],
  },
  {
    label: 'Post-sale',
    links: [
      { href: '/admin/invoices', label: 'Invoices', icon: FileText, badge: (b) => b.invoices.overdue, badgeTone: 'problem' },
      { href: '/admin/payouts', label: 'Payouts', icon: Banknote, badge: (b) => b.payouts.pending },
      { href: '/admin/shipments', label: 'Shipments', icon: Truck, badge: (b) => b.shipments.toShip + b.shipments.exception },
    ],
  },
  {
    label: 'People',
    links: [
      { href: '/admin/emails', label: 'Inbox', icon: Inbox, badge: (b) => b.inbox.unread },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/outreach', label: 'Outreach', icon: Mail, badge: (b) => b.outreach.due },
    ],
  },
  {
    label: 'Reports & System',
    links: [
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
      { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook, badge: (b) => b.webhooks.failed24h, badgeTone: 'problem' },
    ],
  },
];

/** Flat list, kept for the topbar's "current page" lookup. */
export const adminLinks: AdminLink[] = adminNav.flatMap((g) => g.links);

export function isActiveAdminLink(href: string, pathname: string) {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ count, tone }: { count: number; tone: 'attention' | 'problem' }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-medium leading-5 text-center tabular-nums',
        tone === 'problem' ? 'bg-red-100 text-red-700' : 'bg-champagne/40 text-charcoal',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const badges = useAdminBadges();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-1 pb-5">
        <Link href="/admin" className="font-logo text-xl block" onClick={onNavigate}>
          MAYELLS
        </Link>
        <p className="text-xs text-muted-foreground">Admin</p>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-5 pr-1">
        {adminNav.map((group) => (
          <div key={group.label ?? 'root'}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.links.map((link) => {
                const active = isActiveAdminLink(link.href, pathname);
                const count = badges && link.badge ? link.badge(badges) : 0;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors',
                      active
                        ? 'bg-accent/20 text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/10',
                    )}
                  >
                    <link.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link.label}</span>
                    <CountBadge count={count} tone={link.badgeTone ?? 'attention'} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="pt-4 mt-4 border-t border-border/50">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View public site
        </a>
      </div>
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change (adjust-state-during-render pattern)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

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

      {/* Mobile drawer. `fixed` only — an earlier `relative` alongside it made
          the drawer an in-flow column that pushed every admin page 256px right
          on phones. */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-64 border-r border-border/50 bg-background p-4 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!mobileOpen}
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

      {/* Desktop sidebar: sticky so it stays put on long pages, scrolls
          internally on short viewports instead of overlapping the footer. */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-border/50 bg-background">
        <div className="sticky top-0 h-screen p-4">
          <SidebarContent pathname={pathname} />
        </div>
      </aside>
    </>
  );
}
