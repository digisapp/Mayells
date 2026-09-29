export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { calls } from '@/db/schema';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { CallCard } from '@/components/admin/CallCard';
import { FilterChips } from '../_components/FilterChips';
import { Pager } from '../_components/Pager';

const FILTERS = [
  { value: 'all', label: 'All calls' },
  { value: 'lead', label: 'Leads' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'info', label: 'Enquiries' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const PAGE_SIZE = 50;

export default async function AdminCallsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; page?: string }>;
}) {
  await requireAdminPage();
  const { outcome: outcomeParam, page: pageParam } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.value === outcomeParam) ? (outcomeParam as Filter) : 'all';
  const page = Math.min(10_000, Math.max(1, parseInt(pageParam ?? '1', 10) || 1));

  const conditions: SQL[] = [];
  if (filter !== 'all') conditions.push(eq(calls.outcome, filter));
  const where = conditions.length ? and(...conditions) : undefined;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [rows, [{ matching }], [stats]] = await Promise.all([
    db
      .select()
      .from(calls)
      .where(where)
      .orderBy(desc(calls.startedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ matching: sql<number>`count(*)::int` }).from(calls).where(where),
    db
      .select({
        total: sql<number>`count(*)::int`,
        leads: sql<number>`count(*) filter (where ${calls.outcome} = 'lead')::int`,
        transferred: sql<number>`count(*) filter (where ${calls.outcome} = 'transferred')::int`,
        avgSeconds: sql<number | null>`round(avg(${calls.durationSeconds}))::int`,
      })
      .from(calls)
      .where(gte(calls.startedAt, since)),
  ]);

  const totalPages = Math.ceil(matching / PAGE_SIZE);
  const hrefFor = (p: number, outcome: Filter = filter) => {
    const params = new URLSearchParams();
    if (outcome !== 'all') params.set('outcome', outcome);
    if (p > 1) params.set('page', String(p));
    return `/admin/calls${params.size ? `?${params}` : ''}`;
  };
  // Past the end (a stale link, or calls deleted since): land on the last page.
  if (page > 1 && page > totalPages) redirect(hrefFor(Math.max(1, totalPages)));

  const tiles = [
    { label: 'Calls', value: stats.total.toLocaleString(), sub: 'Answered by the concierge' },
    { label: 'Leads taken', value: stats.leads.toLocaleString(), sub: 'Became or updated a prospect' },
    { label: 'Transferred', value: stats.transferred.toLocaleString(), sub: 'Handed to a specialist' },
    {
      label: 'Average length',
      value: stats.avgSeconds == null ? '—' : `${Math.floor(stats.avgSeconds / 60)}m ${String(stats.avgSeconds % 60).padStart(2, '0')}s`,
      sub: 'Per call',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Calls"
        description={
          <span className="block max-w-2xl">
            Calls answered by the Mayells phone concierge, with notes on each. Calls are not recorded; leads
            also appear in Prospects. Figures cover the last 30 days.
          </span>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="py-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{t.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageHeader>

      <FilterChips
        label="Filter by outcome"
        value={filter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, href: hrefFor(1, f.value) }))}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === 'all'
              ? 'No calls yet. They appear here once the voice agent is running and a number is routed to it.'
              : 'No calls with this outcome.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
          <Pager
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => hrefFor(p)}
            summary={<>Page {page} of {totalPages} · {matching.toLocaleString()} calls</>}
          />
        </div>
      )}
    </div>
  );
}
