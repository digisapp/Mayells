import Link from 'next/link';
import { cn } from '@/lib/utils';

export type AccountTab = 'my-bids' | 'watchlist' | 'invoices';

const TABS: { id: AccountTab; label: string; href: string }[] = [
  { id: 'my-bids', label: 'My Bids', href: '/my-bids' },
  { id: 'watchlist', label: 'Watchlist', href: '/watchlist' },
  { id: 'invoices', label: 'Invoices', href: '/invoices' },
];

/**
 * One frame for the signed-in bidder pages (My Bids, Watchlist, Invoices):
 * same width, gutters, heading and a tab row between them, so moving between
 * them doesn't jump the layout. Their loading.tsx files render it too.
 */
export function AccountShell({
  active,
  title,
  icon,
  children,
}: {
  active: AccountTab;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <div className="flex items-center gap-3">
        {icon}
        <h1 className="font-display text-display-lg">{title}</h1>
      </div>

      <nav aria-label="Your account" className="mt-5 mb-8 border-b border-border/60">
        <ul className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => {
            const current = tab.id === active;
            return (
              <li key={tab.id} className="shrink-0">
                <Link
                  href={tab.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center border-b-2 text-sm font-medium transition-colors',
                    current
                      ? 'border-champagne text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
