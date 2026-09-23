'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdminBadges } from '@/hooks/useAdminBadges';
import { Menu, X, ExternalLink } from 'lucide-react';
import { adminNav, adminSettingsLink, isActiveAdminLink, type AdminLink } from './admin-nav';

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

function NavItem({
  link,
  pathname,
  count,
  onNavigate,
}: {
  link: AdminLink;
  pathname: string;
  count: number;
  onNavigate?: () => void;
}) {
  const active = isActiveAdminLink(link, pathname);
  return (
    <Link
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
              {group.links.map((link) => (
                <NavItem key={link.href} link={link} pathname={pathname} count={badges && link.badge ? link.badge(badges) : 0} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="pt-3 mt-3 border-t border-border/50 space-y-0.5">
        <NavItem
          link={adminSettingsLink}
          pathname={pathname}
          count={badges && adminSettingsLink.badge ? adminSettingsLink.badge(badges) : 0}
          onNavigate={onNavigate}
        />
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
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
