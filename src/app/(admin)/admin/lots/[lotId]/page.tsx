'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { LotForm, type LotFormData, type SellerSummary } from '@/components/admin/LotForm';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatCurrencyWithCents } from '@/types';

type LotStatus = 'draft' | 'pending_review' | 'approved' | 'for_sale' | 'in_auction' | 'sold' | 'unsold' | 'withdrawn';
type SaleType = 'auction' | 'gallery' | 'private';

interface Placement {
  auctionId: string;
  auctionTitle: string;
  auctionSlug: string;
  auctionStatus: string;
  auctionType: string;
  lotNumber: number;
  closingAt: string | null;
  biddingEndsAt: string | null;
}

interface BidderSummary {
  id: string;
  fullName: string | null;
  paddleNumber: string | null;
}

interface AdminBid {
  id: string;
  amount: number;
  maxBidAmount: number | null;
  bidType: string;
  status: string;
  createdAt: string | null;
  bidderId: string;
  bidderName: string | null;
  bidderPaddle: string | null;
}

interface AdminLot {
  id: string;
  title: string;
  subtitle: string | null;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  saleType: SaleType;
  status: LotStatus;
  artist: string | null;
  maker: string | null;
  period: string | null;
  circa: string | null;
  origin: string | null;
  medium: string | null;
  dimensions: string | null;
  weight: string | null;
  condition: string | null;
  conditionNotes: string | null;
  provenance: string | null;
  literature: string | null;
  exhibited: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  reservePrice: number | null;
  startingBid: number | null;
  buyNowPrice: number | null;
  sellerId: string | null;
  currentBidAmount: number;
  bidCount: number;
  hammerPrice: number | null;
  winnerId: string | null;
  slug: string | null;
  isFeatured: boolean;
  isHighlight: boolean;
  images: Array<{ id: string; url: string; isPrimary: boolean }>;
  bidHistory: AdminBid[];
  placements: Placement[];
  seller: SellerSummary | null;
  highBidder: BidderSummary | null;
  winner: BidderSummary | null;
  invoice: { id: string; invoiceNumber: string; status: string } | null;
  publicPath: string | null;
}

interface LotAction {
  label: string;
  to: LotStatus;
  success: string;
  variant?: 'default' | 'outline' | 'destructive';
  /** When set, the button is disabled and this text explains why. */
  disabledReason?: string;
  confirm?: {
    title: string;
    description: string;
    confirmLabel: string;
    variant: 'default' | 'destructive';
  };
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  for_sale: 'bg-green-100 text-green-800',
  in_auction: 'bg-purple-100 text-purple-800',
  sold: 'bg-emerald-100 text-emerald-800',
  unsold: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-600',
};

const auctionStatusColors: Record<string, string> = {
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

const invoiceStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-blue-100 text-blue-800',
};

const dateTimeFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormat.format(d);
}

function bidderLabel(paddle: string | null | undefined, name: string | null | undefined, id?: string): string {
  if (paddle) return `Paddle ${paddle}${name ? ` · ${name}` : ''}`;
  if (name) return name;
  return id ? `Bidder ${id.slice(0, 8)}` : 'Bidder';
}

/**
 * The operator-facing actions for each lot status. These mirror the guards in
 * PATCH /api/lots/[lotId]: the server still has the final say, and its error
 * text is what the toast shows when it refuses.
 */
function actionsFor(lot: AdminLot): LotAction[] {
  const directSale = lot.saleType === 'gallery' || lot.saleType === 'private';
  switch (lot.status) {
    case 'draft':
      return [
        { label: 'Send for review', to: 'pending_review', success: 'Sent for review' },
        { label: 'Approve for sale', to: 'approved', variant: 'outline', success: 'Lot approved' },
      ];
    case 'pending_review':
      return [
        { label: 'Approve', to: 'approved', success: 'Lot approved' },
        { label: 'Back to draft', to: 'draft', variant: 'outline', success: 'Moved back to draft' },
      ];
    case 'approved':
      return [
        {
          label: 'List for sale now',
          to: 'for_sale',
          success: 'Lot listed for sale',
          disabledReason: !directSale
            ? 'Auction lots go on sale when their auction opens — assign this lot to a sale from the auction editor. Switch the sale type to Gallery or Private to list it directly.'
            : lot.saleType === 'gallery' && !lot.buyNowPrice
              ? 'Save a Buy Now price first — a gallery lot cannot be listed without one.'
              : undefined,
          confirm: {
            title: 'List this lot for sale now?',
            description: lot.saleType === 'gallery'
              ? `It appears in the public gallery immediately at ${lot.buyNowPrice ? formatCurrency(lot.buyNowPrice) : 'its Buy Now price'} and can be purchased at once.`
              : 'It appears in the public gallery immediately as a private-sale lot (price on inquiry).',
            confirmLabel: 'List for sale',
            variant: 'default',
          },
        },
        { label: 'Back to draft', to: 'draft', variant: 'outline', success: 'Moved back to draft' },
      ];
    case 'for_sale':
      return [
        {
          label: 'Unlist',
          to: 'approved',
          variant: 'outline',
          success: 'Lot unlisted',
          confirm: {
            title: 'Unlist this lot?',
            description: 'It disappears from the public gallery immediately and returns to approved inventory. You can list it again at any time.',
            confirmLabel: 'Unlist',
            variant: 'default',
          },
        },
        {
          label: 'Withdraw',
          to: 'withdrawn',
          variant: 'destructive',
          success: 'Lot withdrawn',
          confirm: {
            title: 'Withdraw this lot?',
            description: 'The lot is removed from sale and marked withdrawn. It can be restored to draft later if it comes back.',
            confirmLabel: 'Withdraw',
            variant: 'destructive',
          },
        },
      ];
    case 'in_auction':
      return [
        {
          label: 'Withdraw from sale',
          to: 'withdrawn',
          variant: 'destructive',
          success: 'Lot withdrawn from its sale',
          confirm: {
            title: 'Withdraw this lot from its sale?',
            description: `The lot is removed from the auction and marked withdrawn. ${lot.bidCount > 0 ? `All ${lot.bidCount} bid${lot.bidCount === 1 ? '' : 's'} on it are retracted and the bid state is cleared — bidders are not notified automatically.` : 'Any bids placed on it are retracted.'} This cannot be undone.`,
            confirmLabel: 'Withdraw from sale',
            variant: 'destructive',
          },
        },
      ];
    case 'unsold':
      return [
        { label: 'Back to approved', to: 'approved', success: 'Lot returned to approved inventory' },
        { label: 'Back to draft', to: 'draft', variant: 'outline', success: 'Moved back to draft' },
      ];
    case 'withdrawn':
      return [
        { label: 'Restore to draft', to: 'draft', success: 'Lot restored to draft' },
      ];
    case 'sold':
    default:
      return [];
  }
}

const statusHints: Partial<Record<LotStatus, string>> = {
  draft: 'Not visible to the public. Send it for review or approve it directly.',
  pending_review: 'Waiting for a second pair of eyes before it can be catalogued.',
  approved: 'Ready to be assigned to a sale. Auction lots become visible when their sale is scheduled; gallery and private lots must be listed.',
  for_sale: 'Live in the public gallery.',
  in_auction: 'Bidding is open. Field edits are still allowed, but the only status change is a withdrawal.',
  unsold: 'The sale ended without meeting the reserve or without bids.',
  withdrawn: 'Removed from sale. Restore it to draft to start over.',
  sold: 'A sold lot is a settled record — refund the invoice to return it to inventory.',
};

export default function EditLotPage() {
  const router = useRouter();
  const { lotId } = useParams<{ lotId: string }>();
  const [lot, setLot] = useState<AdminLot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: 'action'; action: LotAction } | { kind: 'delete' } | null>(null);

  const fetchLot = useCallback(async (): Promise<AdminLot> => {
    const res = await fetch(`/api/lots/${lotId}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.data) throw new Error(data.error || 'Failed to load lot');
    return data.data as AdminLot;
  }, [lotId]);

  useEffect(() => {
    let cancelled = false;
    fetchLot()
      .then((loaded) => { if (!cancelled) setLot(loaded); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [fetchLot]);

  async function refreshLot() {
    try {
      setLot(await fetchLot());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reload lot');
    }
  }

  async function changeStatus(action: LotAction) {
    setBusyAction(action.to);
    try {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update status');
      } else {
        toast.success(action.success);
      }
    } catch {
      toast.error('Network error — the status may not have changed');
    } finally {
      setBusyAction(null);
    }
    // Always re-read: a refused transition still tells us the true state.
    await refreshLot();
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to save lot');
      toast.success('Lot saved');
      await refreshLot();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/lots/${lotId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Lot deleted');
      router.push('/admin/lots');
      return;
    }
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || 'Failed to delete');
  }

  if (loadError) {
    return (
      <div className="max-w-3xl">
        <Link href="/admin/lots" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Lots
        </Link>
        <h1 className="font-display text-display-sm mb-4">Lot Not Found</h1>
        <p className="text-muted-foreground">This lot does not exist or could not be loaded.</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const formData: LotFormData = {
    title: lot.title || '',
    subtitle: lot.subtitle || '',
    description: lot.description || '',
    categoryId: lot.categoryId || '',
    subcategoryId: lot.subcategoryId || '',
    saleType: lot.saleType || 'auction',
    artist: lot.artist || '',
    maker: lot.maker || '',
    period: lot.period || '',
    circa: lot.circa || '',
    origin: lot.origin || '',
    medium: lot.medium || '',
    dimensions: lot.dimensions || '',
    weight: lot.weight || '',
    condition: lot.condition || '',
    conditionNotes: lot.conditionNotes || '',
    provenance: lot.provenance || '',
    literature: lot.literature || '',
    exhibited: lot.exhibited || '',
    estimateLow: lot.estimateLow ? String(lot.estimateLow / 100) : '',
    estimateHigh: lot.estimateHigh ? String(lot.estimateHigh / 100) : '',
    reservePrice: lot.reservePrice ? String(lot.reservePrice / 100) : '',
    startingBid: lot.startingBid ? String(lot.startingBid / 100) : '',
    buyNowPrice: lot.buyNowPrice ? String(lot.buyNowPrice / 100) : '',
    sellerId: lot.sellerId || '',
    isFeatured: !!lot.isFeatured,
    isHighlight: !!lot.isHighlight,
  };

  const images = (lot.images || []).map((img) => ({ id: img.id, url: img.url, isPrimary: img.isPrimary }));

  const status = lot.status;
  const actions = actionsFor(lot);
  const placements = lot.placements || [];
  const bidHistory = lot.bidHistory || [];
  const isSold = status === 'sold';
  const canDelete = status !== 'in_auction' && status !== 'sold';

  const effectiveHigh = Math.max(lot.currentBidAmount || 0, lot.hammerPrice || 0);
  const reserveState = lot.reservePrice
    ? effectiveHigh >= lot.reservePrice
      ? { label: `Met (${formatCurrency(lot.reservePrice)})`, className: 'text-green-700' }
      : { label: `Not met (${formatCurrency(lot.reservePrice)})`, className: 'text-amber-700' }
    : { label: 'No reserve', className: 'text-muted-foreground' };

  const dialog = (() => {
    if (!pending) return null;
    if (pending.kind === 'delete') {
      return {
        title: 'Delete this lot?',
        description: 'Permanently removes the lot, its images and any draft/scheduled sale placements. Lots with bid history cannot be deleted — withdraw those instead. This cannot be undone.',
        confirmLabel: 'Delete permanently',
        variant: 'destructive' as const,
        onConfirm: handleDelete,
      };
    }
    const { action } = pending;
    return {
      title: action.confirm?.title ?? `${action.label}?`,
      description: action.confirm?.description ?? '',
      confirmLabel: action.confirm?.confirmLabel ?? action.label,
      variant: action.confirm?.variant ?? ('default' as const),
      onConfirm: () => changeStatus(action),
    };
  })();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/lots" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-display-sm">Edit Lot</h1>
          <Badge className={statusColors[status]}>{status.replace('_', ' ')}</Badge>
        </div>
        {lot.publicPath && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={lot.publicPath} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> View on site
            </a>
          </Button>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Sale state</CardTitle></CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Placements</p>
            {placements.length === 0 ? (
              <p className="text-muted-foreground">
                Not assigned to any sale.
                {lot.saleType === 'auction' && (
                  <> Add it from the <Link href="/admin/auctions" className="underline underline-offset-2 hover:text-foreground">auction editor</Link>.</>
                )}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {placements.map((p) => (
                  <li key={p.auctionId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/admin/auctions/${p.auctionId}`} className="font-medium hover:underline">
                      {p.auctionTitle}
                    </Link>
                    <Badge className={auctionStatusColors[p.auctionStatus] || ''}>{p.auctionStatus}</Badge>
                    <span className="text-muted-foreground">Lot {p.lotNumber}</span>
                    <span className="text-muted-foreground">
                      · {p.closingAt ? 'closes' : 'sale ends'} {formatDateTime(p.closingAt ?? p.biddingEndsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Current bid</dt>
              <dd className="mt-0.5 font-medium">
                {lot.bidCount > 0 ? formatCurrency(lot.currentBidAmount) : '—'}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">High bidder</dt>
              <dd className="mt-0.5">
                {lot.highBidder ? bidderLabel(lot.highBidder.paddleNumber, lot.highBidder.fullName, lot.highBidder.id) : <span className="text-muted-foreground">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Reserve</dt>
              <dd className={`mt-0.5 ${reserveState.className}`}>{reserveState.label}</dd>
            </div>
            {isSold && (
              <>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Hammer</dt>
                  <dd className="mt-0.5 font-medium">{lot.hammerPrice != null ? formatCurrencyWithCents(lot.hammerPrice) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Winner</dt>
                  <dd className="mt-0.5">
                    {lot.winner ? bidderLabel(lot.winner.paddleNumber, lot.winner.fullName, lot.winner.id) : <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {lot.invoice ? (
                      <>
                        <Link href="/admin/invoices" className="font-medium hover:underline">{lot.invoice.invoiceNumber}</Link>
                        <Badge className={invoiceStatusColors[lot.invoice.status] || ''}>{lot.invoice.status}</Badge>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No invoice yet</span>
                    )}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Seller</dt>
              <dd className="mt-0.5">
                {lot.seller
                  ? <span>{lot.seller.fullName || lot.seller.email}</span>
                  : <span className="text-amber-700">No seller — payout will be skipped</span>}
              </dd>
            </div>
          </dl>

          {bidHistory.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Bid history (latest 20)</p>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Max bid</TableHead>
                      <TableHead>Bidder</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bidHistory.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(b.createdAt)}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{formatCurrencyWithCents(b.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{b.maxBidAmount != null ? formatCurrencyWithCents(b.maxBidAmount) : '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{bidderLabel(b.bidderPaddle, b.bidderName, b.bidderId)}</TableCell>
                        <TableCell className="capitalize">{b.bidType}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{b.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {statusHints[status] && <p className="text-sm text-muted-foreground">{statusHints[status]}</p>}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.to + action.label}
                  size="sm"
                  variant={action.variant ?? 'default'}
                  disabled={!!action.disabledReason || busyAction !== null}
                  title={action.disabledReason}
                  onClick={() => (action.confirm ? setPending({ kind: 'action', action }) : changeStatus(action))}
                >
                  {busyAction === action.to ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          {actions.filter((a) => a.disabledReason).map((a) => (
            <p key={a.label} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{a.label}:</span> {a.disabledReason}
            </p>
          ))}
        </CardContent>
      </Card>

      <LotForm
        initialData={formData}
        initialImages={images}
        initialSeller={lot.seller}
        lotId={lotId}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Save Lot"
        cancelHref="/admin/lots"
      />

      {canDelete && (
        <div className="mt-8 pt-8 border-t">
          <Button variant="destructive" onClick={() => setPending({ kind: 'delete' })}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Lot
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Only possible for lots that never took a bid. Prefer Withdraw to keep a record.</p>
        </div>
      )}

      {dialog && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          variant={dialog.variant}
          onConfirm={dialog.onConfirm}
        />
      )}
    </div>
  );
}
