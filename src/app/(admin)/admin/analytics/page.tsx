export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { PageHeader } from '@/components/admin/PageHeader';
import { cn } from '@/lib/utils';
import { SalesView } from './sales-view';
import { TrafficView } from './traffic/traffic-view';

const VIEWS = [
  { value: 'traffic', label: 'Traffic & leads', href: '/admin/analytics' },
  { value: 'sales', label: 'Sales', href: '/admin/analytics?view=sales' },
] as const;

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; range?: string; site?: string }>;
}) {
  await requireAdminPage();
  const { view, range, site } = await searchParams;
  const current = view === 'sales' ? 'sales' : 'traffic';

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={
          current === 'traffic'
            ? 'Who comes to mayells.com and the city sites, and how they become leads.'
            : 'Sales, bidding, consignments and the catalogue.'
        }
      >
        <nav aria-label="Analytics views" className="flex gap-6 border-b">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={v.href}
              aria-current={v.value === current ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 pb-2 text-sm font-medium transition-colors',
                v.value === current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {current === 'sales' ? <SalesView rangeParam={range} /> : <TrafficView rangeParam={range} siteParam={site} />}
    </div>
  );
}
