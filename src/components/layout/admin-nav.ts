import {
  LayoutDashboard,
  Gavel,
  Image,
  Users,
  UserPlus,
  FileText,
  BarChart3,
  Mail,
  Inbox,
  ClipboardCheck,
  Truck,
  Banknote,
  Settings,
  Globe,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import type { AdminBadges } from '@/hooks/useAdminBadges';

export interface AdminLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other route prefixes that live under this item (e.g. the live console under Auctions). */
  also?: string[];
  /** Which badge count to show next to the item, if any. */
  badge?: (b: AdminBadges) => number;
  /** Amber (attention) vs red (problem) badge. */
  badgeTone?: 'attention' | 'problem';
}

export interface AdminNavGroup {
  label: string | null;
  links: AdminLink[];
}

// Ordered the way work flows through the house: consign → sell → settle →
// clients → growth. Settings sits apart at the foot of the sidebar.
export const adminNav: AdminNavGroup[] = [
  {
    label: null,
    links: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Consignments',
    links: [
      { href: '/admin/prospects', label: 'Prospects', icon: UserPlus, badge: (b) => b.prospects.awaiting + b.prospects.signed },
      { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck, badge: (b) => b.appraisals.review },
      { href: '/admin/lots', label: 'Lots', icon: Image, also: ['/admin/ai'], badge: (b) => b.lots.pendingReview },
    ],
  },
  {
    label: 'Sales',
    links: [
      { href: '/admin/auctions', label: 'Auctions', icon: Gavel, also: ['/admin/live'], badge: (b) => b.auctions.settling },
      { href: '/admin/invoices', label: 'Invoices', icon: FileText, badge: (b) => b.invoices.overdue, badgeTone: 'problem' },
      { href: '/admin/payouts', label: 'Payouts', icon: Banknote, badge: (b) => b.payouts.pending },
      { href: '/admin/shipments', label: 'Shipments', icon: Truck, badge: (b) => b.shipments.toShip + b.shipments.exception },
    ],
  },
  {
    label: 'Clients',
    links: [
      { href: '/admin/emails', label: 'Inbox', icon: Inbox, badge: (b) => b.inbox.unread },
      { href: '/admin/calls', label: 'Calls', icon: Phone },
      { href: '/admin/users', label: 'Clients', icon: Users },
      { href: '/admin/outreach', label: 'Outreach', icon: Mail, badge: (b) => b.outreach.due },
    ],
  },
  {
    label: 'Growth',
    links: [
      { href: '/admin/microsites', label: 'Microsites', icon: Globe },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

/** Pinned to the bottom of the sidebar; the webhook log is a Settings sub-page. */
export const adminSettingsLink: AdminLink = {
  href: '/admin/settings',
  label: 'Settings',
  icon: Settings,
  also: ['/admin/webhooks'],
  badge: (b) => b.webhooks.failed24h,
  badgeTone: 'problem',
};

export const adminLinks: AdminLink[] = [...adminNav.flatMap((g) => g.links), adminSettingsLink];

function underPrefix(prefix: string, pathname: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isActiveAdminLink(link: AdminLink, pathname: string) {
  if (link.href === '/admin') return pathname === '/admin';
  return [link.href, ...(link.also ?? [])].some((p) => underPrefix(p, pathname));
}

export interface Crumb {
  label: string;
  href: string;
}

// Titles for the fixed segments below a section. Dynamic ids get the
// singular noun of their section, since the page itself shows the name.
const SECTION_TITLES: Record<string, string> = {
  '/admin/ai': 'AI assist',
  '/admin/live': 'Live console',
  '/admin/webhooks': 'System log',
};
const ITEM_NOUNS: Record<string, string> = {
  prospects: 'Prospect',
  appraisals: 'Appraisal',
  lots: 'Lot',
  auctions: 'Auction',
  live: 'Sale',
  users: 'Client',
  outreach: 'Contact',
};
const LEAF_TITLES: Record<string, string> = {
  new: 'New',
  settlement: 'Settlement',
};

/**
 * Breadcrumb trail for an admin path, e.g.
 * /admin/auctions/abc/settlement → Auctions › Auction › Settlement.
 * The first crumb is always the sidebar item that owns the path.
 */
export function adminBreadcrumbs(pathname: string): Crumb[] {
  const owner = adminLinks.find((l) => isActiveAdminLink(l, pathname));
  if (!owner || owner.href === '/admin') return [{ label: 'Dashboard', href: '/admin' }];

  const crumbs: Crumb[] = [{ label: owner.label, href: owner.href }];
  // Sub-pages that sit under a sidebar item without sharing its URL prefix.
  const section = (owner.also ?? []).find((p) => underPrefix(p, pathname)) ?? owner.href;
  if (section !== owner.href) crumbs.push({ label: SECTION_TITLES[section] ?? section, href: section });

  const rest = pathname.slice(section.length).split('/').filter(Boolean);
  const sectionKey = section.split('/').pop() ?? '';
  let href = section;
  rest.forEach((seg, i) => {
    href += `/${seg}`;
    let label = LEAF_TITLES[seg];
    if (!label) label = i === 0 ? (ITEM_NOUNS[sectionKey] ?? 'Details') : seg;
    if (seg === 'new') label = `New ${(ITEM_NOUNS[sectionKey] ?? '').toLowerCase()}`.trim();
    crumbs.push({ label, href });
  });
  return crumbs;
}
