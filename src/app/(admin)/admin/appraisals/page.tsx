export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { estateVisits } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ClipboardCheck, ChevronLeft, ChevronRight, Users2 } from 'lucide-react';
import { formatCurrency } from '@/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const VISIT_STATUSES = ['draft', 'uploading', 'processing', 'review', 'sent', 'archived'] as const;
type VisitStatus = (typeof VISIT_STATUSES)[number];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  uploading: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  sent: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};

const statusLabels: Record<VisitStatus, string> = {
  draft: 'Draft',
  uploading: 'Uploading',
  processing: 'Processing',
  review: 'In review',
  sent: 'Sent',
  archived: 'Archived',
};

function hrefFor(page: number, status?: VisitStatus): string {
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (page > 1) q.set('page', String(page));
  const qs = q.toString();
  return `/admin/appraisals${qs ? `?${qs}` : ''}`;
}

// visit_date is stored as a date-only timestamp; format in UTC so it doesn't
// render a day early for viewers west of Greenwich.
function formatVisitDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—';
}

export default async function AppraisalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageParam, status: statusParam } = await searchParams;
  const status = (VISIT_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? (statusParam as VisitStatus)
    : undefined;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const where = status ? eq(estateVisits.status, status) : undefined;

  const [visits, [{ total }], counts] = await Promise.all([
    db
      .select()
      .from(estateVisits)
      .where(where)
      .orderBy(desc(estateVisits.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(estateVisits).where(where),
    db
      .select({ status: estateVisits.status, n: sql<number>`count(*)::int` })
      .from(estateVisits)
      .groupBy(estateVisits.status),
  ]);

  const byStatus: Partial<Record<VisitStatus, number>> = {};
  for (const row of counts) byStatus[row.status] = row.n;
  const allCount = counts.reduce((s, c) => s + c.n, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-sm">Estate Appraisals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            In-person appraisals with AI-powered analysis
          </p>
        </div>
        <Link href="/admin/appraisals/new">
          <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
            <Plus className="h-4 w-4 mr-2" />
            New Appraisal
          </Button>
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={hrefFor(1)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            !status
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-border hover:bg-accent/10',
          )}
        >
          All <span className="opacity-70">{allCount}</span>
        </Link>
        {VISIT_STATUSES.map((s) => (
          <Link
            key={s}
            href={status === s ? hrefFor(1) : hrefFor(1, s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
              status === s
                ? cn(statusColors[s], 'border-transparent ring-2 ring-offset-1 ring-foreground/30')
                : 'bg-background text-muted-foreground border-border hover:bg-accent/10',
            )}
          >
            {statusLabels[s]} <span className="opacity-70">{byStatus[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-lg mb-2">
              {status ? `No ${statusLabels[status].toLowerCase()} appraisals` : 'No appraisals yet'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {status ? 'Try another status filter.' : 'Create your first estate appraisal to get started.'}
            </p>
            {!status && (
              <Link href="/admin/appraisals/new">
                <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
                  <Plus className="h-4 w-4 mr-2" />
                  New Appraisal
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {from}–{to} of {total} appraisal{total !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Client</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Location</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-center px-6 py-3 font-medium text-muted-foreground">Items</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Estimate</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-0 hover:bg-accent/5">
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/appraisals/${visit.id}`}
                          className="font-medium hover:text-champagne transition-colors"
                        >
                          {visit.clientName}
                        </Link>
                        {visit.clientEmail && (
                          <p className="text-xs text-muted-foreground">{visit.clientEmail}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {[visit.clientCity, visit.clientState].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {formatVisitDate(visit.visitDate)}
                      </td>
                      <td className="px-6 py-4 text-center tabular-nums">
                        {visit.processedCount}/{visit.itemCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {visit.totalEstimateHigh > 0
                          ? `${formatCurrency(visit.totalEstimateLow)} – ${formatCurrency(visit.totalEstimateHigh)}`
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={statusColors[visit.status] || ''}>
                            {visit.status}
                          </Badge>
                          {visit.prospectId && (
                            <Link
                              href={`/admin/prospects/${visit.prospectId}`}
                              className="text-muted-foreground hover:text-foreground"
                              title="Open the prospect created from this visit"
                            >
                              <Users2 className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefFor(page - 1, status)}>
                <Button variant="outline" size="sm" className="gap-1">
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" className="gap-1" disabled>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
            )}
            {page < totalPages ? (
              <Link href={hrefFor(page + 1, status)}>
                <Button variant="outline" size="sm" className="gap-1">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" className="gap-1" disabled>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
