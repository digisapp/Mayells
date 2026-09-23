import { describe, expect, it } from 'vitest';
import { adminBreadcrumbs, adminLinks, isActiveAdminLink } from '../admin-nav';

const labels = (path: string) => adminBreadcrumbs(path).map((c) => c.label);

describe('adminBreadcrumbs', () => {
  it('names list pages after their sidebar item', () => {
    expect(labels('/admin')).toEqual(['Dashboard']);
    expect(labels('/admin/users')).toEqual(['Clients']);
  });

  it('gives detail and new pages a readable trail', () => {
    expect(labels('/admin/lots/abc')).toEqual(['Lots', 'Lot']);
    expect(labels('/admin/lots/new')).toEqual(['Lots', 'New lot']);
    expect(labels('/admin/auctions/abc/settlement')).toEqual(['Auctions', 'Auction', 'Settlement']);
  });

  it('files sub-sections under the item that owns them', () => {
    expect(labels('/admin/live/abc')).toEqual(['Auctions', 'Live console', 'Sale']);
    expect(labels('/admin/ai')).toEqual(['Lots', 'AI assist']);
    expect(labels('/admin/webhooks')).toEqual(['Settings', 'System log']);
    expect(adminBreadcrumbs('/admin/auctions/abc/settlement')[1].href).toBe('/admin/auctions/abc');
  });
});

describe('isActiveAdminLink', () => {
  const link = (href: string) => adminLinks.find((l) => l.href === href)!;

  it('highlights exactly one sidebar item per page', () => {
    for (const path of ['/admin', '/admin/live/x', '/admin/webhooks', '/admin/lotsx']) {
      const active = adminLinks.filter((l) => isActiveAdminLink(l, path)).map((l) => l.href);
      expect(active.length).toBeLessThanOrEqual(1);
    }
    expect(isActiveAdminLink(link('/admin/auctions'), '/admin/live')).toBe(true);
    expect(isActiveAdminLink(link('/admin/lots'), '/admin/lotsx')).toBe(false);
  });
});
