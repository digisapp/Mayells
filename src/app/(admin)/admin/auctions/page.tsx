export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { auctions, bids } from '@/db/schema';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { isPubliclyVisibleAuction, type AuctionStatus } from '@/lib/auctions/visibility';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, ChevronLeft, ChevronRight, ExternalLink, Radio, Gavel } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';

const PAGE_SIZE = 50;

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  preview: 'bg-indigo-100 text-indigo-800',
  open: 'bg-green-100 text-green-800',
  live: 'bg-red-100 text-red-800',
  closing: 'bg-orange-100 text-orange-800',
  closed: 'bg-gray-100 text-gray-600',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-600',
};

/** Filter chips. `null` statuses = no status constraint. */
const STATUS_FILTERS: Record<string, { label: string; statuses: AuctionStatus[] | null }> = {
  all: { label: 'All', statuses: null },
  draft: { label: 'Draft', statuses: ['draft'] },
  scheduled: { label: 'Scheduled / Preview', statuses: ['scheduled', 'preview'] },
  open: { label: 'Open / Live', statuses: ['open', 'live'] },
  settling: { label: 'Closing / Settling', statuses: ['closing', 'closed'] },
  completed: { label: 'Completed', statuses: ['completed'] },
  cancelled: { label: 'Cancelled', statuses: ['cancelled'] },
};

const TYPE_FILTERS: Record<string, { label: string; type: 'timed' | 'live' | null }> = {
  all: { label: 'All formats', type: null },
  timed: { label: 'Timed', type: 'timed' },
  live: { label: 'Live', type: 'live' },
};

const FINISHED: readonly string[] = ['closing', 'closed', 'completed', 'cancelled'];

function formatWhen(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function buildHref(params: { status: string; type: string; page: number }) {
  const q = new URLSearchParams();
  if (params.status !== 'all') q.set('status', params.status);
  if (params.type !== 'all') q.set('type', params.type);
  if (params.page > 1) q.set('page', String(params.page));
  const qs = q.toString();
  return qs ? `/admin/auctions?${qs}` : '/admin/auctions';
}

export default async function AdminAuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; type?: string }>;
}) {
  await requireAdminPage();

  const { page: pageParam, status: statusParam, type: typeParam } = await searchParams;
  const parsedPage = Number(pageParam ?? '1');
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const statusKey = statusParam && statusParam in STATUS_FILTERS ? statusParam : 'all';
  const typeKey = typeParam && typeParam in TYPE_FILTERS ? typeParam : 'all';
  const statusFilter = STATUS_FILTERS[statusKey].statuses;
  const typeFilter = TYPE_FILTERS[typeKey].type;

  const conditions: SQL[] = [];
  if (statusFilter) conditions.push(inArray(auctions.status, statusFilter));
  if (typeFilter) conditions.push(eq(auctions.type, typeFilter));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Sales that need attention first (in progress, then settling), then what is
  // coming up, drafts, and finally history. Within a group, most recent first;
  // an unscheduled sale sorts after scheduled ones.
  const statusGroup = sql<number>`case ${auctions.status}
    when 'live' then 0 when 'open' then 0
    when 'closing' then 1 when 'closed' then 1
    when 'scheduled' then 2 when 'preview' then 2
    when 'draft' then 3
    when 'completed' then 4
    else 5 end`;

  // auctions.totalBids is a denormalized counter nothing writes to; count the
  // real rows. Retracted bids (withdrawn lots) are not activity.
  const bidCount = sql<number>`(select count(*) from ${bids} where ${bids.auctionId} = ${auctions.id} and ${bids.status} <> 'retracted')::int`;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ auction: auctions, bidCount })
      .from(auctions)
      .where(where)
      .orderBy(statusGroup, sql`${auctions.biddingStartsAt} desc nulls last`, sql`${auctions.createdAt} desc`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auctions).where(where),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = statusKey !== 'all' || typeKey !== 'all';

  return (
    <div>
      <PageHeader
        title="Auctions"
        description={`${total} ${filtered ? 'matching' : 'total'}`}
        actions={
          <>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/admin/live"><Radio className="h-4 w-4" /> Live console</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/admin/auctions/new"><Plus className="h-4 w-4" /> New auction</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {Object.entries(STATUS_FILTERS).map(([key, f]) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant={key === statusKey ? 'default' : 'outline'}
            className="h-8"
          >
            <Link href={buildHref({ status: key, type: typeKey, page: 1 })}>{f.label}</Link>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {Object.entries(TYPE_FILTERS).map(([key, f]) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant={key === typeKey ? 'secondary' : 'ghost'}
            className="h-7 text-xs"
          >
            <Link href={buildHref({ status: statusKey, type: key, page: 1 })}>{f.label}</Link>
          </Button>
        ))}
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lots</TableHead>
              <TableHead className="text-right">Bids</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead>Opens</TableHead>
              <TableHead>Closes</TableHead>
              <TableHead className="w-[140px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ auction, bidCount: bidTotal }) => {
              const isPublic = !!auction.slug && isPubliclyVisibleAuction(auction.status);
              const showConsole = auction.type === 'live' && !FINISHED.includes(auction.status);
              return (
                <TableRow key={auction.id}>
                  <TableCell>
                    <Link href={`/admin/auctions/${auction.id}`} className="font-medium hover:underline">
                      {auction.title}
                    </Link>
                    {auction.saleNumber && (
                      <div className="text-xs text-muted-foreground">Sale {auction.saleNumber}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={auction.type === 'live' ? 'destructive' : 'secondary'} className="capitalize">
                      {auction.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[auction.status] || ''}>
                      {auction.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{auction.lotCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{bidTotal > 0 ? bidTotal : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{auction.buyerPremiumPercent}%</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{formatWhen(auction.biddingStartsAt)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {auction.type === 'live' && !auction.biddingEndsAt
                      ? auction.actualEndedAt ? formatWhen(auction.actualEndedAt) : 'Auctioneer ends'
                      : formatWhen(auction.actualEndedAt ?? auction.biddingEndsAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {showConsole && (
                        <Button asChild variant="ghost" size="sm" title="Live console">
                          <Link href={`/admin/live/${auction.id}`}>
                            <Radio className={`h-3.5 w-3.5 ${auction.status === 'live' ? 'text-red-600' : ''}`} />
                          </Link>
                        </Button>
                      )}
                      {isPublic && (
                        <Button asChild variant="ghost" size="sm" title="View on site">
                          <a href={`/auctions/${auction.slug}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm" title="Edit">
                        <Link href={`/admin/auctions/${auction.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-12">
                  <div className="flex flex-col items-center text-center gap-3">
                    <Gavel className="h-8 w-8 text-muted-foreground" />
                    {filtered ? (
                      <>
                        <p className="text-muted-foreground">No auctions match this filter.</p>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/admin/auctions">Show all auctions</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">No auctions yet. Create a sale, then catalogue approved lots into it.</p>
                        <Button asChild size="sm" className="gap-2">
                          <Link href="/admin/auctions/new"><Plus className="h-4 w-4" /> New auction</Link>
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={buildHref({ status: statusKey, type: typeKey, page: page - 1 })}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={buildHref({ status: statusKey, type: typeKey, page: page + 1 })}>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
