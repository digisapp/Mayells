'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { cn } from '@/lib/utils';
import { MICROSITE_LABELS } from '@/lib/microsites/labels';
import { LensButton } from '@/components/admin/LensButton';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';
import {
  Brain,
  Send,
  FileSignature,
  Package,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Copy,
  ExternalLink,
  DollarSign,
  BarChart3,
  CheckCircle,
  XCircle,
  Edit3,
  RefreshCw,
  RotateCcw,
  Trash2,
  Archive,
  Pencil,
  Video,
  User,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Types ──

interface UploadLink {
  id: string;
  token: string;
  status: string;
  maxItems: number | null;
  expiresAt: string | null;
  itemCount: number;
  createdAt: string;
  items?: UploadItem[];
}

type ProspectStatus =
  | 'new'
  | 'contacted'
  | 'upload_sent'
  | 'items_received'
  | 'under_review'
  | 'agreement_sent'
  | 'agreement_signed'
  | 'accepted'
  | 'declined'
  | 'archived';

type ProspectSource = 'phone' | 'email' | 'website' | 'referral' | 'estate_visit' | 'walk_in' | 'other';

interface Prospect {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: ProspectSource;
  sourceNotes: string | null;
  site: string | null;
  status: ProspectStatus;
  totalItems: number;
  reviewedItems: number;
  acceptedItems: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  agreedCommissionPercent: number | null;
  agreementSentAt: string | null;
  agreementSignedAt: string | null;
  // Seller-of-record account, minted (or linked) when lots are created.
  userId: string | null;
  notes: string | null;
  itemSummary: string | null;
  uploadLinks: UploadLink[];
  createdAt: string;
  updatedAt: string;
}

interface UploadItem {
  id: string;
  uploadLinkId: string;
  prospectId: string;
  images: string[] | null;
  sellerNotes: string | null;
  sellerTitle: string | null;
  sortOrder: number;
  groupLabel: string | null;
  aiTitle: string | null;
  aiSubtitle: string | null;
  aiDescription: string | null;
  aiArtist: string | null;
  aiMaker: string | null;
  aiPeriod: string | null;
  aiCirca: string | null;
  aiOrigin: string | null;
  aiMedium: string | null;
  aiDimensions: string | null;
  aiCondition: string | null;
  aiConditionNotes: string | null;
  aiCategory: string | null;
  aiTags: string[] | null;
  aiEstimateLow: number | null;
  aiEstimateHigh: number | null;
  aiConfidence: string | null;
  aiReasoning: string | null;
  aiMarketTrend: string | null;
  aiRecommendedReserve: number | null;
  aiSuggestedStartingBid: number | null;
  aiProcessedAt: string | null;
  status: string;
  adminNotes: string | null;
  reviewedAt: string | null;
  finalTitle: string | null;
  finalDescription: string | null;
  finalEstimateLow: number | null;
  finalEstimateHigh: number | null;
  finalReserve: number | null;
  finalCategory: string | null;
  lotId: string | null;
  auctionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuctionOption {
  id: string;
  title: string;
  status: string;
  biddingStartsAt: string | null;
}

interface PendingConfirm {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<void>;
}

interface ContactForm {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: ProspectSource;
  status: ProspectStatus;
  notes: string;
}

// ── Constants ──

const itemStatusColors: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  cataloged: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  lot_created: 'bg-emerald-100 text-emerald-800',
};

const prospectStatusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-800',
  contacted: 'bg-blue-100 text-blue-800',
  upload_sent: 'bg-indigo-100 text-indigo-800',
  items_received: 'bg-purple-100 text-purple-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  agreement_sent: 'bg-orange-100 text-orange-800',
  agreement_signed: 'bg-green-100 text-green-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-500',
};

const PROSPECT_STATUSES: { value: ProspectStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'upload_sent', label: 'Upload sent' },
  { value: 'items_received', label: 'Items received' },
  { value: 'under_review', label: 'Under review' },
  { value: 'agreement_sent', label: 'Agreement sent' },
  { value: 'agreement_signed', label: 'Agreement signed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'archived', label: 'Archived' },
];

const PROSPECT_SOURCES: { value: ProspectSource; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'estate_visit', label: 'Estate visit' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
];

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const bannerTones = {
  blue: 'bg-blue-50 border-blue-200 text-blue-900 [&_.sub]:text-blue-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-900 [&_.sub]:text-purple-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900 [&_.sub]:text-yellow-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-900 [&_.sub]:text-orange-700',
  green: 'bg-green-50 border-green-200 text-green-900 [&_.sub]:text-green-700',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900 [&_.sub]:text-indigo-700',
  red: 'bg-red-50 border-red-200 text-red-900 [&_.sub]:text-red-700',
  gray: 'bg-muted/50 border-border text-foreground [&_.sub]:text-muted-foreground',
} as const;

const bannerButton = {
  blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  purple: 'bg-purple-600 hover:bg-purple-700 text-white',
  yellow: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  orange: 'bg-orange-600 hover:bg-orange-700 text-white',
  green: 'bg-green-600 hover:bg-green-700 text-white',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  red: 'bg-red-600 hover:bg-red-700 text-white',
  gray: '',
} as const;

type Tone = keyof typeof bannerTones;

// ── Helpers ──

const VIDEO_URL_RE = /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i;
const isVideoUrl = (url: string) => VIDEO_URL_RE.test(url);

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceBadge(confidence: string | null) {
  if (!confidence) return null;
  const val = parseFloat(confidence);
  if (isNaN(val)) return <Badge variant="secondary">{confidence}</Badge>;
  const color =
    val >= 0.8
      ? 'bg-green-100 text-green-800'
      : val >= 0.5
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <Badge className={color} variant="secondary">
      {(val * 100).toFixed(0)}% confidence
    </Badge>
  );
}

interface ItemOverrides {
  finalTitle: string;
  finalDescription: string;
  // Money fields are edited in DOLLARS in the UI; the DB stores cents.
  finalEstimateLow: string;
  finalEstimateHigh: string;
  finalReserve: string;
  finalCategory: string;
  adminNotes: string;
}

/** Cents (DB) -> dollars string for an input field. */
function centsToDollarsInput(cents: number | null | undefined): string {
  return cents == null ? '' : String(cents / 100);
}

/** Dollars string (input field) -> cents for the API, or undefined if blank/invalid. */
function dollarsInputToCents(value: string): number | undefined {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? undefined : Math.round(parsed * 100);
}

const emptyContact: ContactForm = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  source: 'email',
  status: 'new',
  notes: '',
};

const PROSPECT_TABS = ['items', 'overview', 'agreement', 'lots'] as const;
type ProspectTab = (typeof PROSPECT_TABS)[number];

function isProspectTab(value: string | null): value is ProspectTab {
  return !!value && (PROSPECT_TABS as readonly string[]).includes(value);
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <div className="h-24 bg-muted animate-pulse rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function AdminProspectDetailPage() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProspectDetail />
    </Suspense>
  );
}

function ProspectDetail() {
  const { prospectId } = useParams<{ prospectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The item grid is where most of the work happens, so it's the default tab.
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<ProspectTab>(isProspectTab(initialTab) ? initialTab : 'items');

  function selectTab(next: string) {
    if (!isProspectTab(next)) return;
    setTab(next);
    // Keep the URL shareable without a server round-trip.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [auctions, setAuctions] = useState<AuctionOption[]>([]);
  const [auctionsLoading, setAuctionsLoading] = useState(true);

  // Action loading states
  const [processingAI, setProcessingAI] = useState(false);
  const [rerunningIds, setRerunningIds] = useState<Set<string>>(new Set());
  const [sendingUploadLink, setSendingUploadLink] = useState(false);
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [creatingLots, setCreatingLots] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const [savingContact, setSavingContact] = useState(false);

  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingItems, setEditingItems] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, ItemOverrides>>({});
  const [auctionId, setAuctionId] = useState('');
  // Seeded from the prospect's agreed rate, else the house rate configured in
  // Settings (the API sends it) — never a second hardcoded percentage.
  const [commissionPercent, setCommissionPercent] = useState('25');
  const commissionSeeded = useRef(false);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [lightbox, setLightbox] = useState<{ media: string[]; index: number; title: string } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContact);

  // ── Data Fetching ──

  const fetchProspect = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        const data: Prospect = json.data;
        setProspect(data);
        // Seed the commission input from the rate on file exactly once so an
        // admin mid-edit isn't overwritten by a background refetch.
        if (!commissionSeeded.current) {
          setCommissionPercent(String(data.agreedCommissionPercent ?? json.defaultCommissionPercent ?? 25));
          commissionSeeded.current = true;
        }
      } else {
        toast.error(json.error || 'Failed to load prospect');
      }
    } catch {
      toast.error('Network error loading prospect');
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/items`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.items) {
        setItems(json.items);
      } else {
        toast.error(json.error || 'Failed to load items');
      }
    } catch {
      toast.error('Network error loading items');
    } finally {
      setItemsLoading(false);
    }
  }, [prospectId]);

  const fetchAuctions = useCallback(async () => {
    try {
      const res = await fetch('/api/auctions?status=draft,scheduled,preview');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Failed to load sales');
        return;
      }
      const list: AuctionOption[] = (json.data ?? []).map((a: AuctionOption) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        biddingStartsAt: a.biddingStartsAt ?? null,
      }));
      setAuctions(list);
    } catch {
      toast.error('Network error loading sales');
    } finally {
      setAuctionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProspect();
    fetchItems();
    fetchAuctions();
  }, [fetchProspect, fetchItems, fetchAuctions]);

  function refreshAll() {
    fetchProspect();
    fetchItems();
  }

  // ── Actions ──

  async function runAI(itemIds?: string[]) {
    if (itemIds) setRerunningIds((prev) => new Set([...prev, ...itemIds]));
    else setProcessingAI(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemIds ? { itemIds } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const parts = [`${json.processed} processed`];
        if (json.skipped) parts.push(`${json.skipped} declined (no images)`);
        if (json.failed) parts.push(`${json.failed} failed`);
        toast.success(`AI processing complete: ${parts.join(', ')} of ${json.total}`);
        refreshAll();
      } else {
        toast.error(json.error || 'AI processing failed');
      }
    } catch {
      toast.error('Network error during AI processing');
    } finally {
      if (itemIds) {
        setRerunningIds((prev) => {
          const next = new Set(prev);
          itemIds.forEach((id) => next.delete(id));
          return next;
        });
      } else {
        setProcessingAI(false);
      }
    }
  }

  async function doSendUploadLink() {
    setSendingUploadLink(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/upload-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: 14 }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        try {
          await navigator.clipboard.writeText(json.data.url);
        } catch {
          // Clipboard can be unavailable (insecure context / permissions).
        }
        toast.success(
          json.data.emailed
            ? `${json.data.reused ? 'Existing' : 'New'} upload link emailed and copied to clipboard`
            : 'Upload link copied to clipboard (no email on file)',
        );
        fetchProspect();
      } else {
        toast.error(json.error || 'Failed to create upload link');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingUploadLink(false);
    }
  }

  function requestSendUploadLink() {
    if (!prospect) return;
    setPending({
      title: 'Send upload link?',
      description: prospect.email ? (
        <>
          This emails a private upload link to <strong>{prospect.fullName}</strong> at {prospect.email}.
          If an active link already exists it is re-sent rather than replaced.
        </>
      ) : (
        <>No email on file — a link will be created and copied to your clipboard for you to share.</>
      ),
      confirmLabel: prospect.email ? 'Send link' : 'Create link',
      onConfirm: doSendUploadLink,
    });
  }

  function parsedCommission(): number | null {
    const commission = parseInt(commissionPercent, 10);
    return isNaN(commission) || commission < 0 || commission > 100 ? null : commission;
  }

  async function doSendAgreement(commission: number) {
    setSendingAgreement(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionPercent: commission }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Agreement sent');
        fetchProspect();
      } else {
        toast.error(json.error || 'Failed to send agreement');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingAgreement(false);
    }
  }

  function requestSendAgreement() {
    if (!prospect) return;
    const commission = parsedCommission();
    if (commission === null) {
      toast.error('Commission must be between 0 and 100');
      return;
    }
    const resend = !!prospect.agreementSentAt;
    setPending({
      title: resend ? 'Resend agreement?' : 'Send consignment agreement?',
      description: (
        <>
          This emails the consignment agreement to <strong>{prospect.fullName}</strong> at {prospect.email} with a{' '}
          <strong>{commission}%</strong> commission covering {acceptedCount} accepted item{acceptedCount !== 1 ? 's' : ''}.
          {resend && prospect.agreedCommissionPercent != null && prospect.agreedCommissionPercent !== commission && (
            <> The rate on file ({prospect.agreedCommissionPercent}%) will be replaced.</>
          )}
        </>
      ),
      confirmLabel: resend ? 'Resend' : 'Send agreement',
      onConfirm: () => doSendAgreement(commission),
    });
  }

  async function doCreateLots(opts: { skipAgreement?: boolean; commissionPercent?: number }) {
    setCreatingLots(true);
    try {
      const acceptedItemIds = items.filter((i) => i.status === 'accepted').map((i) => i.id);
      const res = await fetch(`/api/admin/prospects/${prospectId}/create-lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auctionId || undefined,
          itemIds: acceptedItemIds.length > 0 ? acceptedItemIds : undefined,
          ...(opts.skipAgreement ? { skipAgreement: true, commissionPercent: opts.commissionPercent } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${json.lotsCreated} lot${json.lotsCreated === 1 ? '' : 's'} created${auctionId ? ' and assigned to the sale' : ''}`);
        refreshAll();
      } else {
        toast.error(json.error || 'Failed to create lots');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setCreatingLots(false);
    }
  }

  function requestCreateLots() {
    if (!prospect) return;
    const selectedAuction = auctions.find((a) => a.id === auctionId);
    const summary = `${acceptedCount} lot${acceptedCount !== 1 ? 's' : ''}${selectedAuction ? ` in "${selectedAuction.title}"` : ''}`;

    if (!prospect.agreementSignedAt) {
      const commission = parsedCommission();
      if (commission === null) {
        toast.error('Enter a commission between 0 and 100 to create lots without a signed agreement');
        return;
      }
      setPending({
        title: 'Create lots without a signed agreement?',
        description: (
          <>
            The consignment agreement has not been signed. Creating {summary} now records a{' '}
            <strong>{commission}%</strong> commission on file — only do this if the terms were agreed to
            offline. The consignor will be emailed their portal link.
          </>
        ),
        confirmLabel: 'Create lots anyway',
        onConfirm: () => doCreateLots({ skipAgreement: true, commissionPercent: commission }),
      });
      return;
    }

    setPending({
      title: 'Create lots?',
      description: <>This creates {summary} and emails the consignor their portal link.</>,
      confirmLabel: 'Create lots',
      onConfirm: () => doCreateLots({}),
    });
  }

  async function handleItemAction(
    itemId: string,
    action: 'accept' | 'decline' | 'reset',
    itemOverrides?: ItemOverrides
  ) {
    setUpdatingItems((prev) => new Set(prev).add(itemId));
    try {
      const payload: Record<string, unknown> = { id: itemId, action };
      // Money inputs are in dollars; the API expects cents.
      const lowCents = itemOverrides ? dollarsInputToCents(itemOverrides.finalEstimateLow) : undefined;
      const highCents = itemOverrides ? dollarsInputToCents(itemOverrides.finalEstimateHigh) : undefined;
      const reserveCents = itemOverrides ? dollarsInputToCents(itemOverrides.finalReserve) : undefined;
      if (itemOverrides) {
        if (itemOverrides.finalTitle.trim()) payload.finalTitle = itemOverrides.finalTitle.trim();
        // Description: blank, or left as the AI text, means "no override" —
        // sent as '' so create-lots falls back to the AI description.
        const aiDescription = (items.find((i) => i.id === itemId)?.aiDescription ?? '').trim();
        const description = itemOverrides.finalDescription.trim();
        payload.finalDescription = description === aiDescription ? '' : description;
        if (lowCents !== undefined) payload.finalEstimateLow = lowCents;
        if (highCents !== undefined) payload.finalEstimateHigh = highCents;
        if (reserveCents !== undefined) payload.finalReserve = reserveCents;
        if (itemOverrides.finalCategory.trim())
          payload.finalCategory = itemOverrides.finalCategory.trim();
        if (itemOverrides.adminNotes.trim())
          payload.adminNotes = itemOverrides.adminNotes.trim();
      }

      const res = await fetch(`/api/admin/prospects/${prospectId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [payload] }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const nextStatus = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cataloged';
        toast.success(action === 'reset' ? 'Item reset to cataloged' : `Item ${nextStatus}`);
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: nextStatus,
                  reviewedAt: action === 'reset' ? null : new Date().toISOString(),
                  ...(itemOverrides?.finalTitle.trim() && {
                    finalTitle: itemOverrides.finalTitle.trim(),
                  }),
                  ...(itemOverrides && {
                    finalDescription: (payload.finalDescription as string) || null,
                  }),
                  ...(lowCents !== undefined && { finalEstimateLow: lowCents }),
                  ...(highCents !== undefined && { finalEstimateHigh: highCents }),
                  ...(reserveCents !== undefined && { finalReserve: reserveCents }),
                  ...(itemOverrides?.finalCategory.trim() && {
                    finalCategory: itemOverrides.finalCategory.trim(),
                  }),
                  ...(itemOverrides?.adminNotes.trim() && {
                    adminNotes: itemOverrides.adminNotes.trim(),
                  }),
                }
              : i
          )
        );
        if (json.acceptedItems !== undefined) {
          setProspect((prev) =>
            prev
              ? {
                  ...prev,
                  acceptedItems: json.acceptedItems,
                  reviewedItems: json.reviewedItems,
                  totalEstimateLow: json.totalEstimateLow,
                  totalEstimateHigh: json.totalEstimateHigh,
                }
              : prev
          );
        }
        setEditingItems((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      } else {
        toast.error(json.error || 'Failed to update item');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  // ── Bulk Actions ──

  async function doBulkAcceptAll() {
    const catalogedItems = items.filter((i) => i.status === 'cataloged');
    const payload = catalogedItems.map((i) => ({ id: i.id, action: 'accept' as const }));
    setUpdatingItems(new Set(catalogedItems.map((i) => i.id)));
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${catalogedItems.length} item${catalogedItems.length !== 1 ? 's' : ''} accepted`);
        fetchItems();
        if (json.acceptedItems !== undefined) {
          setProspect((prev) =>
            prev
              ? {
                  ...prev,
                  acceptedItems: json.acceptedItems,
                  reviewedItems: json.reviewedItems,
                  totalEstimateLow: json.totalEstimateLow,
                  totalEstimateHigh: json.totalEstimateHigh,
                }
              : prev
          );
        }
      } else {
        toast.error(json.error || 'Bulk accept failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingItems(new Set());
    }
  }

  function requestBulkAcceptAll() {
    const count = items.filter((i) => i.status === 'cataloged').length;
    if (count === 0) {
      toast.error('No cataloged items to accept');
      return;
    }
    setPending({
      title: `Accept all ${count} cataloged item${count !== 1 ? 's' : ''}?`,
      description: 'Each item is accepted with its AI title, category, and estimates as-is. You can still override or reset individual items afterwards.',
      confirmLabel: 'Accept all',
      onConfirm: doBulkAcceptAll,
    });
  }

  // ── Contact / lifecycle ──

  function openContactEdit() {
    if (!prospect) return;
    setContactForm({
      fullName: prospect.fullName,
      email: prospect.email ?? '',
      phone: prospect.phone ?? '',
      address: prospect.address ?? '',
      city: prospect.city ?? '',
      state: prospect.state ?? '',
      zip: prospect.zip ?? '',
      source: prospect.source,
      status: prospect.status,
      notes: prospect.notes ?? '',
    });
    setContactOpen(true);
  }

  async function handleSaveContact() {
    if (!contactForm.fullName.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingContact(true);
    try {
      const res = await fetch('/api/admin/prospects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: prospectId,
          fullName: contactForm.fullName.trim(),
          email: contactForm.email.trim(),
          phone: contactForm.phone.trim(),
          address: contactForm.address.trim(),
          city: contactForm.city.trim(),
          state: contactForm.state.trim(),
          zip: contactForm.zip.trim(),
          source: contactForm.source,
          status: contactForm.status,
          notes: contactForm.notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Failed to update contact');
        return;
      }
      toast.success('Contact updated');
      setContactOpen(false);
      fetchProspect();
    } catch {
      toast.error('Network error');
    } finally {
      setSavingContact(false);
    }
  }

  async function setProspectStatus(status: ProspectStatus, successMessage: string) {
    const res = await fetch('/api/admin/prospects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prospectId, status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || 'Failed to update status');
      return;
    }
    toast.success(successMessage);
    fetchProspect();
  }

  function requestArchive() {
    if (!prospect) return;
    setPending({
      title: `Archive ${prospect.fullName}?`,
      description: 'Archiving keeps every record (items, lots, agreement) and removes the prospect from the active funnel. You can reopen it later from Edit contact.',
      confirmLabel: 'Archive',
      onConfirm: () => setProspectStatus('archived', 'Prospect archived'),
    });
  }

  function requestDeclineProspect() {
    if (!prospect) return;
    setPending({
      title: `Decline ${prospect.fullName}?`,
      description: 'Marks this consignment as declined. No email is sent.',
      confirmLabel: 'Decline',
      variant: 'destructive',
      onConfirm: () => setProspectStatus('declined', 'Prospect declined'),
    });
  }

  async function doDelete() {
    const res = await fetch(`/api/admin/prospects/${prospectId}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || 'Failed to delete prospect');
      return;
    }
    toast.success('Prospect deleted');
    router.push('/admin/prospects');
  }

  function requestDelete() {
    if (!prospect) return;
    if (lotsExist) {
      setPending({
        title: "This prospect can't be deleted",
        description: `${lotCreatedCount} item${lotCreatedCount !== 1 ? 's have' : ' has'} already become lots in the catalog, so the prospect is part of the sale record. Archive it instead to clear it from the funnel.`,
        confirmLabel: 'Archive instead',
        onConfirm: () => setProspectStatus('archived', 'Prospect archived'),
      });
      return;
    }
    setPending({
      title: `Delete ${prospect.fullName}?`,
      description: 'This removes the prospect, their upload links, and every uploaded item. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: doDelete,
    });
  }

  // ── UI helpers ──

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleEdit(itemId: string, item: UploadItem) {
    setEditingItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        if (!overrides[itemId]) {
          setOverrides((o) => ({
            ...o,
            [itemId]: {
              finalTitle: item.finalTitle || item.aiTitle || '',
              finalDescription: item.finalDescription || item.aiDescription || '',
              finalEstimateLow: centsToDollarsInput(item.finalEstimateLow ?? item.aiEstimateLow),
              finalEstimateHigh: centsToDollarsInput(item.finalEstimateHigh ?? item.aiEstimateHigh),
              finalReserve: centsToDollarsInput(item.finalReserve ?? item.aiRecommendedReserve),
              finalCategory: item.finalCategory || item.aiCategory || '',
              adminNotes: item.adminNotes || '',
            },
          }));
        }
      }
      return next;
    });
  }

  function updateOverride(itemId: string, field: keyof ItemOverrides, value: string) {
    setOverrides((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  }

  function openLightbox(media: string[], index: number, title: string) {
    if (media.length === 0) return;
    setLightbox({ media, index, title });
  }

  function stepLightbox(delta: number) {
    setLightbox((prev) => {
      if (!prev) return prev;
      const len = prev.media.length;
      return { ...prev, index: (prev.index + delta + len) % len };
    });
  }

  // ── Derived Values ──

  const totalItems = items.length;
  const processingCount = items.filter((i) => i.status === 'processing').length;
  const uploadedCount = items.filter((i) => i.status === 'uploaded').length;
  const catalogedCount = items.filter((i) => i.status === 'cataloged').length;
  const acceptedCount = items.filter((i) => i.status === 'accepted').length;
  const declinedCount = items.filter((i) => i.status === 'declined').length;
  const lotCreatedCount = items.filter((i) => i.status === 'lot_created').length;
  const processedItems = totalItems - uploadedCount - processingCount;
  const hasAcceptedItems = acceptedCount > 0;
  const lotsExist = items.some((i) => !!i.lotId);

  // Same formula the server uses: override wins over AI, declined excluded.
  const estLow = items.reduce(
    (sum, i) => (i.status === 'declined' ? sum : sum + (i.finalEstimateLow ?? i.aiEstimateLow ?? 0)),
    0
  );
  const estHigh = items.reduce(
    (sum, i) => (i.status === 'declined' ? sum : sum + (i.finalEstimateHigh ?? i.aiEstimateHigh ?? 0)),
    0
  );
  const acceptedEstLow = items.reduce(
    (sum, i) => (i.status === 'accepted' || i.status === 'lot_created' ? sum + (i.finalEstimateLow ?? i.aiEstimateLow ?? 0) : sum),
    0
  );
  const acceptedEstHigh = items.reduce(
    (sum, i) => (i.status === 'accepted' || i.status === 'lot_created' ? sum + (i.finalEstimateHigh ?? i.aiEstimateHigh ?? 0) : sum),
    0
  );

  // ── Loading Skeleton ──

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <p className="text-muted-foreground mt-8 text-center">Prospect not found.</p>
    );
  }

  const latestLink = [...(prospect.uploadLinks ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const agreementSigned = !!prospect.agreementSignedAt;
  const lotsSearchHref = `/admin/lots?q=${encodeURIComponent(prospect.fullName)}`;

  // ── Next-action banner ──

  function banner(tone: Tone, title: string, sub: React.ReactNode, actions: React.ReactNode) {
    return (
      <div className={cn('border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3', bannerTones[tone])}>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {sub && <p className="sub text-xs mt-0.5">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
      </div>
    );
  }

  function renderNextAction() {
    if (!prospect) return null;
    const status = prospect.status;

    if (status === 'archived') {
      return banner('gray', 'Archived', 'This prospect is out of the active funnel. Change its status from Edit contact to reopen it.', (
        <Button size="sm" variant="outline" onClick={openContactEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Edit contact
        </Button>
      ));
    }

    if (status === 'declined') {
      return banner('red', 'Declined', 'This consignment was declined. Archive it to clear it from the funnel.', (
        <Button size="sm" variant="outline" onClick={requestArchive}>
          <Archive className="h-4 w-4 mr-2" /> Archive
        </Button>
      ));
    }

    if (status === 'accepted') {
      return banner(
        'green',
        `Accepted — ${lotCreatedCount} lot${lotCreatedCount !== 1 ? 's' : ''} created`,
        hasAcceptedItems
          ? `${acceptedCount} accepted item${acceptedCount !== 1 ? 's' : ''} still need${acceptedCount === 1 ? 's' : ''} lots.`
          : 'All accepted items are in the catalog.',
        (
          <>
            <Link href={lotsSearchHref} className={cn('inline-flex items-center h-8 px-3 rounded-md text-xs font-medium', bannerButton.green)}>
              <Package className="h-4 w-4 mr-2" /> View lots
            </Link>
            {hasAcceptedItems && (
              <Button size="sm" variant="outline" onClick={requestCreateLots} disabled={creatingLots}>
                {creatingLots ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
                Create remaining lots
              </Button>
            )}
          </>
        ),
      );
    }

    if (processingAI || processingCount > 0 || rerunningIds.size > 0) {
      const n = processingAI ? uploadedCount + processingCount : processingCount + rerunningIds.size;
      return banner('purple', 'AI processing running', `${n > 0 ? `${n} item${n !== 1 ? 's' : ''} ` : ''}being cataloged and appraised — about a minute per item. Items stuck for 15+ minutes are picked up on the next run.`, (
        <Button size="sm" variant="outline" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      ));
    }

    if (uploadedCount > 0) {
      return banner('purple', `Next step: Run AI processing on ${uploadedCount} new item${uploadedCount !== 1 ? 's' : ''}`, 'AI will catalog, appraise, and categorize each item automatically.', (
        <Button size="sm" onClick={() => runAI()} className={bannerButton.purple}>
          <Brain className="h-4 w-4 mr-2" /> Run AI Processing
        </Button>
      ));
    }

    if (status === 'agreement_sent') {
      return banner(
        'orange',
        `Agreement sent ${formatDate(prospect.agreementSentAt)} — awaiting signature`,
        `Sent to ${prospect.email ?? 'the consignor'} at ${prospect.agreedCommissionPercent ?? commissionPercent}% commission. Resend if it was missed, or create lots without a signature from the Lots tab.`,
        (
          <Button size="sm" onClick={requestSendAgreement} disabled={sendingAgreement || !prospect.email} className={bannerButton.orange}>
            {sendingAgreement ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Resend agreement
          </Button>
        ),
      );
    }

    if (status === 'agreement_signed') {
      if (hasAcceptedItems) {
        return banner('green', 'Next step: Create lots from accepted items', `Agreement signed ${formatDate(prospect.agreementSignedAt)}. Create ${acceptedCount} lot${acceptedCount !== 1 ? 's' : ''} to start selling.`, (
          <Button size="sm" onClick={requestCreateLots} disabled={creatingLots} className={bannerButton.green}>
            {creatingLots ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
            Create Lots
          </Button>
        ));
      }
      return banner('green', `Agreement signed ${formatDate(prospect.agreementSignedAt)}`, catalogedCount > 0 ? 'Accept the cataloged items on the Items tab to create lots.' : 'No accepted items are waiting for lot creation.', null);
    }

    if (catalogedCount > 0 && acceptedCount === 0) {
      return banner('yellow', `Next step: Review and accept ${catalogedCount} cataloged item${catalogedCount !== 1 ? 's' : ''}`, 'Review AI suggestions on the Items tab, then accept or decline each item. Or bulk accept all.', (
        <Button size="sm" onClick={requestBulkAcceptAll} className={bannerButton.yellow}>
          <Check className="h-4 w-4 mr-2" /> Accept All Cataloged
        </Button>
      ));
    }

    if (hasAcceptedItems) {
      if (prospect.email) {
        return banner('orange', 'Next step: Send consignment agreement', `${acceptedCount} item${acceptedCount !== 1 ? 's' : ''} accepted (${formatCurrency(acceptedEstLow)} — ${formatCurrency(acceptedEstHigh)}). Send the agreement at ${commissionPercent}% commission.`, (
          <Button size="sm" onClick={requestSendAgreement} disabled={sendingAgreement} className={bannerButton.orange}>
            {sendingAgreement ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSignature className="h-4 w-4 mr-2" />}
            Send Agreement
          </Button>
        ));
      }
      return banner('orange', 'Next step: Record the agreement', `${acceptedCount} item${acceptedCount !== 1 ? 's' : ''} accepted but there is no email on file. Add one to send the agreement, or create lots at the commission on the Agreement tab if the terms were agreed offline.`, (
        <Button size="sm" variant="outline" onClick={openContactEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Edit contact
        </Button>
      ));
    }

    if (totalItems > 0 && declinedCount === totalItems) {
      return banner('red', 'All items declined', 'Nothing here is a fit. Decline the prospect, or send a new upload link if they have more to show.', (
        <>
          <Button size="sm" variant="outline" onClick={requestSendUploadLink} disabled={sendingUploadLink}>
            <Send className="h-4 w-4 mr-2" /> Send upload link
          </Button>
          <Button size="sm" onClick={requestDeclineProspect} className={bannerButton.red}>
            <XCircle className="h-4 w-4 mr-2" /> Decline prospect
          </Button>
        </>
      ));
    }

    if (status === 'upload_sent') {
      return banner(
        'indigo',
        `Upload link sent — waiting on seller${latestLink ? ` (sent ${formatDate(latestLink.createdAt)})` : ''}`,
        prospect.email ? "Resend the link if they haven't received it, or copy it from the Overview tab to share another way." : 'No email on file — copy the link from the Overview tab and share it directly.',
        (
          <Button size="sm" onClick={requestSendUploadLink} disabled={sendingUploadLink} className={bannerButton.indigo}>
            {sendingUploadLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Resend link
          </Button>
        ),
      );
    }

    return banner('blue', 'Next step: Send an upload link', "This prospect hasn't uploaded any items yet. Send them a link to get started.", (
      <Button size="sm" onClick={requestSendUploadLink} disabled={sendingUploadLink} className={bannerButton.blue}>
        {sendingUploadLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
        Send upload link
      </Button>
    ));
  }

  const currentMedia = lightbox ? lightbox.media[lightbox.index] : null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <PageHeader
        className="mb-0"
        title={prospect.fullName}
        badges={
          <Badge
            className={prospectStatusColors[prospect.status] ?? 'bg-gray-100 text-gray-800'}
            variant="secondary"
          >
            {prospect.status.replace(/_/g, ' ')}
          </Badge>
        }
        description={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {prospect.email && <span className="break-all">{prospect.email}</span>}
            {prospect.phone && <span>{prospect.phone}</span>}
            {prospect.company && <span>{prospect.company}</span>}
            {[prospect.city, prospect.state].filter(Boolean).length > 0 && (
              <span>{[prospect.city, prospect.state].filter(Boolean).join(', ')}</span>
            )}
            <span className="capitalize">Source: {prospect.source.replace(/_/g, ' ')}</span>
            {prospect.site && (
              <Link href={`/admin/prospects?site=${prospect.site}`} className="text-champagne-deep font-medium hover:underline">
                {MICROSITE_LABELS[prospect.site]
                  ? `${MICROSITE_LABELS[prospect.site].city} microsite (${MICROSITE_LABELS[prospect.site].domain})`
                  : `${prospect.site} microsite`}
              </Link>
            )}
            {prospect.userId && (
              <Link
                href={`/admin/users/${prospect.userId}`}
                className="inline-flex items-center gap-1 text-champagne hover:underline"
                title="Open the seller account behind this consignment"
              >
                <User className="h-3.5 w-3.5" /> Seller account
              </Link>
            )}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={requestSendUploadLink}
              disabled={sendingUploadLink}
            >
              {sendingUploadLink ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send upload link
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => runAI()}
              disabled={processingAI || uploadedCount === 0}
            >
              {processingAI ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {processingAI ? 'Processing...' : 'Run AI'}
            </Button>

            <Button
              size="sm"
              onClick={requestCreateLots}
              disabled={creatingLots || !hasAcceptedItems}
              className="bg-champagne text-charcoal hover:bg-champagne/90"
            >
              {creatingLots ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              Create lots
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={openContactEdit}>
                  <Pencil /> Edit contact
                </DropdownMenuItem>
                {prospect.status !== 'archived' && (
                  <DropdownMenuItem onSelect={requestArchive}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={requestDelete}
                  title={lotsExist ? 'Prospects with lots cannot be deleted' : undefined}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* ── Next Action Banner (above the tabs so it's never hidden) ── */}
      {renderNextAction()}

      <Tabs value={tab} onValueChange={selectTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList>
            <TabsTrigger value="items" className="gap-2">
              <ImageIcon className="h-4 w-4" /> Items ({totalItems})
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="agreement" className="gap-2">
              <FileSignature className="h-4 w-4" /> Agreement
              {agreementSigned && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
            </TabsTrigger>
            <TabsTrigger value="lots" className="gap-2">
              <Package className="h-4 w-4" /> Lots{lotCreatedCount > 0 && ` (${lotCreatedCount})`}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Items ── */}
        <TabsContent value="items" className="space-y-4 mt-2">
          {catalogedCount > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={requestBulkAcceptAll}>
                <Check className="h-4 w-4 mr-1" /> Accept All Cataloged
              </Button>
            </div>
          )}
          {itemsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No items uploaded yet. Send an upload link to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => {
                const isExpanded = expandedItems.has(item.id);
                const isEditing = editingItems.has(item.id);
                const isUpdating = updatingItems.has(item.id);
                const isRerunning = rerunningIds.has(item.id);
                const itemOv = overrides[item.id];
                const media = item.images ?? [];
                const stills = media.filter((u) => !isVideoUrl(u));
                const primaryImage = stills[0];
                const primaryIsVideo = !primaryImage && media.length > 0;
                const title = item.finalTitle || item.aiTitle || item.sellerTitle || 'Untitled Item';

                const canAccept = item.status === 'cataloged' || (item.status === 'accepted' && isEditing);
                const canDecline = ['uploaded', 'cataloged', 'accepted'].includes(item.status);
                const canReset = item.status === 'accepted' || item.status === 'declined';
                const canOverride = item.status === 'cataloged' || item.status === 'accepted';
                const canRerun = ['uploaded', 'cataloged', 'declined'].includes(item.status);

                return (
                  <Card key={item.id} className="overflow-hidden">
                    <div className="flex">
                      {/* Image */}
                      <button
                        type="button"
                        className="w-32 h-32 flex-shrink-0 bg-muted relative group/thumb text-left"
                        onClick={() => openLightbox(media, 0, title)}
                        disabled={media.length === 0}
                        aria-label={media.length > 0 ? `View ${media.length} photo${media.length !== 1 ? 's' : ''}` : 'No photos'}
                      >
                        {primaryImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview
                          <img
                            src={primaryImage}
                            alt={title}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            {primaryIsVideo ? <Video className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
                          </div>
                        )}
                        {media.length > 1 && (
                          <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                            +{media.length - 1}
                          </div>
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-medium text-sm truncate">{title}</h3>
                          <Badge
                            className={cn(
                              'text-xs flex-shrink-0',
                              itemStatusColors[item.status] ?? 'bg-gray-100 text-gray-800'
                            )}
                            variant="secondary"
                          >
                            {item.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>

                        {(item.finalEstimateLow ?? item.aiEstimateLow) != null && (
                          <p className="text-sm text-muted-foreground">
                            Est: {formatCurrency(item.finalEstimateLow ?? item.aiEstimateLow ?? 0)} -{' '}
                            {formatCurrency(item.finalEstimateHigh ?? item.aiEstimateHigh ?? 0)}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {(item.finalCategory || item.aiCategory) && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.finalCategory || item.aiCategory}
                            </Badge>
                          )}
                          {confidenceBadge(item.aiConfidence)}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {canAccept && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
                              onClick={() => handleItemAction(item.id, 'accept', isEditing ? itemOv : undefined)}
                              disabled={isUpdating}
                            >
                              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                              {item.status === 'accepted' ? 'Save' : 'Accept'}
                            </Button>
                          )}
                          {canDecline && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                              onClick={() => handleItemAction(item.id, 'decline')}
                              disabled={isUpdating}
                            >
                              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                              Decline
                            </Button>
                          )}
                          {canReset && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleItemAction(item.id, 'reset')}
                              disabled={isUpdating}
                              title="Send back to the review queue"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Reset to cataloged
                            </Button>
                          )}
                          {canOverride && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => toggleEdit(item.id, item)}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              {isEditing ? 'Cancel Edit' : 'Override'}
                            </Button>
                          )}
                          {canRerun && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => runAI([item.id])}
                              disabled={isRerunning || processingAI || media.length === 0}
                              title={media.length === 0 ? 'No images to analyze' : 'Run AI cataloging and appraisal again'}
                            >
                              {isRerunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                              Re-run AI
                            </Button>
                          )}
                          {primaryImage && <LensButton imageUrl={primaryImage} />}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs ml-auto"
                            onClick={() => toggleExpand(item.id)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Override Fields */}
                    {isEditing && itemOv && (
                      <div className="border-t bg-muted/30 p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Override AI Suggestions
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Title</label>
                            <Input
                              className="h-8 text-sm"
                              value={itemOv.finalTitle}
                              onChange={(e) => updateOverride(item.id, 'finalTitle', e.target.value)}
                              placeholder="Final title"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Category</label>
                            <Input
                              className="h-8 text-sm"
                              value={itemOv.finalCategory}
                              onChange={(e) => updateOverride(item.id, 'finalCategory', e.target.value)}
                              placeholder="art, antiques, jewelry, fashion, design…"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Estimate Low ($)</label>
                            <Input
                              className="h-8 text-sm"
                              type="number"
                              min={0}
                              step="0.01"
                              value={itemOv.finalEstimateLow}
                              onChange={(e) => updateOverride(item.id, 'finalEstimateLow', e.target.value)}
                              placeholder="Low estimate in dollars"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Estimate High ($)</label>
                            <Input
                              className="h-8 text-sm"
                              type="number"
                              min={0}
                              step="0.01"
                              value={itemOv.finalEstimateHigh}
                              onChange={(e) => updateOverride(item.id, 'finalEstimateHigh', e.target.value)}
                              placeholder="High estimate in dollars"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Reserve ($)</label>
                            <Input
                              className="h-8 text-sm"
                              type="number"
                              min={0}
                              step="0.01"
                              value={itemOv.finalReserve}
                              onChange={(e) => updateOverride(item.id, 'finalReserve', e.target.value)}
                              placeholder="Reserve price in dollars"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-muted-foreground">Description</label>
                            <Textarea
                              className="text-sm"
                              rows={4}
                              value={itemOv.finalDescription}
                              onChange={(e) => updateOverride(item.id, 'finalDescription', e.target.value)}
                              placeholder="Catalog description — leave blank to use the AI description"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Used as the lot description. Clear it to fall back to the AI text.
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-muted-foreground">
                              Verification Notes (internal)
                            </label>
                            <Textarea
                              className="text-sm"
                              rows={2}
                              value={itemOv.adminNotes}
                              onChange={(e) => updateOverride(item.id, 'adminNotes', e.target.value)}
                              placeholder="What Lens/research showed: confirmed maker, comp listings with prices/links, why the estimate was adjusted"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Click {item.status === 'accepted' ? 'Save' : 'Accept'} to apply these overrides.
                        </p>
                      </div>
                    )}

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 p-4 space-y-3">
                        {/* All media */}
                        {media.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              Photos &amp; video ({media.length})
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {media.map((src, idx) => (
                                <div key={idx} className="relative flex-shrink-0 group/lens">
                                  <button
                                    type="button"
                                    onClick={() => openLightbox(media, idx, title)}
                                    className="block w-20 h-20 rounded border overflow-hidden bg-muted"
                                    aria-label={`Open ${isVideoUrl(src) ? 'video' : 'photo'} ${idx + 1}`}
                                  >
                                    {isVideoUrl(src) ? (
                                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                        <Video className="h-6 w-6" />
                                      </div>
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview
                                      <img
                                        src={src}
                                        alt={`${title} image ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </button>
                                  {!isVideoUrl(src) && (
                                    <LensButton
                                      imageUrl={src}
                                      variant="overlay"
                                      className="absolute bottom-1 right-1 opacity-0 group-hover/lens:opacity-100"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {item.adminNotes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                              Verification Notes
                            </p>
                            <p className="text-sm whitespace-pre-wrap">{item.adminNotes}</p>
                          </div>
                        )}

                        {(item.sellerTitle || item.sellerNotes) && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                              Seller Info
                            </p>
                            {item.sellerTitle && (
                              <p className="text-sm">
                                <span className="text-muted-foreground">Title:</span>{' '}
                                {item.sellerTitle}
                              </p>
                            )}
                            {item.sellerNotes && (
                              <p className="text-sm">
                                <span className="text-muted-foreground">Notes:</span>{' '}
                                {item.sellerNotes}
                              </p>
                            )}
                          </div>
                        )}

                        {item.aiProcessedAt && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              AI Catalog
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {item.aiTitle && <DetailRow label="Title" value={item.aiTitle} />}
                              {item.aiSubtitle && <DetailRow label="Subtitle" value={item.aiSubtitle} />}
                              {item.aiArtist && <DetailRow label="Artist" value={item.aiArtist} />}
                              {item.aiMaker && <DetailRow label="Maker" value={item.aiMaker} />}
                              {item.aiPeriod && <DetailRow label="Period" value={item.aiPeriod} />}
                              {item.aiCirca && <DetailRow label="Circa" value={item.aiCirca} />}
                              {item.aiOrigin && <DetailRow label="Origin" value={item.aiOrigin} />}
                              {item.aiMedium && <DetailRow label="Medium" value={item.aiMedium} />}
                              {item.aiDimensions && <DetailRow label="Dimensions" value={item.aiDimensions} />}
                              {item.aiCondition && <DetailRow label="Condition" value={item.aiCondition} />}
                              {item.aiCategory && <DetailRow label="Category" value={item.aiCategory} />}
                            </div>
                            {item.aiDescription && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">Description</p>
                                <p className="text-sm mt-0.5">{item.aiDescription}</p>
                              </div>
                            )}
                            {item.aiConditionNotes && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">Condition notes</p>
                                <p className="text-sm mt-0.5">{item.aiConditionNotes}</p>
                              </div>
                            )}
                            {item.aiTags && item.aiTags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.aiTags.map((tag, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {item.aiProcessedAt && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              AI Appraisal
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {item.aiEstimateLow != null && (
                                <DetailRow label="Estimate Low" value={formatCurrency(item.aiEstimateLow)} />
                              )}
                              {item.aiEstimateHigh != null && (
                                <DetailRow label="Estimate High" value={formatCurrency(item.aiEstimateHigh)} />
                              )}
                              {item.aiRecommendedReserve != null && (
                                <DetailRow label="Rec. Reserve" value={formatCurrency(item.aiRecommendedReserve)} />
                              )}
                              {item.aiSuggestedStartingBid != null && (
                                <DetailRow label="Sug. Starting Bid" value={formatCurrency(item.aiSuggestedStartingBid)} />
                              )}
                              {item.aiMarketTrend && <DetailRow label="Market Trend" value={item.aiMarketTrend} />}
                            </div>
                            {item.aiReasoning && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">Reasoning</p>
                                <p className="text-sm mt-0.5 text-muted-foreground">{item.aiReasoning}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {(item.finalTitle ||
                          item.finalEstimateLow != null ||
                          item.finalEstimateHigh != null ||
                          item.finalReserve != null ||
                          item.finalCategory) && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                              Admin Overrides
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {item.finalTitle && <DetailRow label="Title" value={item.finalTitle} />}
                              {item.finalEstimateLow != null && (
                                <DetailRow label="Estimate Low" value={formatCurrency(item.finalEstimateLow)} />
                              )}
                              {item.finalEstimateHigh != null && (
                                <DetailRow label="Estimate High" value={formatCurrency(item.finalEstimateHigh)} />
                              )}
                              {item.finalReserve != null && (
                                <DetailRow label="Reserve" value={formatCurrency(item.finalReserve)} />
                              )}
                              {item.finalCategory && <DetailRow label="Category" value={item.finalCategory} />}
                            </div>
                          </div>
                        )}

                        {item.lotId && (
                          <div className="pt-2 border-t">
                            <Link
                              href={`/admin/lots/${item.lotId}`}
                              className="text-sm text-champagne hover:underline inline-flex items-center gap-1"
                            >
                              <Package className="h-3 w-3" /> View Lot
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <ImageIcon className="h-4 w-4" /> Total Items
                </div>
                <p className="text-2xl font-semibold">{totalItems}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BarChart3 className="h-4 w-4" /> Processed
                </div>
                <p className="text-2xl font-semibold">
                  {processedItems}
                  <span className="text-sm text-muted-foreground font-normal ml-1">
                    / {totalItems}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <CheckCircle className="h-4 w-4 text-green-600" /> Accepted
                </div>
                <p className="text-2xl font-semibold text-green-700">
                  {acceptedCount + lotCreatedCount}
                  {lotCreatedCount > 0 && (
                    <span className="text-sm text-muted-foreground font-normal ml-1">
                      ({lotCreatedCount} lot{lotCreatedCount !== 1 ? 's' : ''})
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <XCircle className="h-4 w-4 text-red-600" /> Declined
                </div>
                <p className="text-2xl font-semibold text-red-700">{declinedCount}</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="h-4 w-4" /> Est. Value Range
                </div>
                <p className="text-lg font-semibold">
                  {estLow > 0 || estHigh > 0
                    ? `${formatCurrency(estLow)} - ${formatCurrency(estHigh)}`
                    : '--'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={openContactEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {prospect.sourceNotes || prospect.notes || prospect.itemSummary ? (
                <>
                  {prospect.sourceNotes && (
                    <p className="text-sm text-muted-foreground max-w-2xl whitespace-pre-wrap">{prospect.sourceNotes}</p>
                  )}
                  {prospect.notes && (
                    <p className="text-sm text-muted-foreground max-w-2xl whitespace-pre-wrap">{prospect.notes}</p>
                  )}
                  {prospect.itemSummary && (
                    <p className="text-sm text-muted-foreground max-w-2xl italic">{prospect.itemSummary}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Upload Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload links</CardTitle>
            </CardHeader>
            <CardContent>
              {prospect.uploadLinks && prospect.uploadLinks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {prospect.uploadLinks.map((link) => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/upload/${link.token}`;
                    return (
                      <div
                        key={link.id}
                        className="flex items-center gap-2 text-xs border rounded-md px-3 py-1.5 bg-muted/50"
                      >
                        <span className="text-muted-foreground">
                          Upload Link ({link.itemCount} items · {formatDate(link.createdAt)})
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            link.status === 'active' && 'bg-green-100 text-green-800',
                            link.status === 'expired' && 'bg-red-100 text-red-800',
                            link.status === 'completed' && 'bg-blue-100 text-blue-800'
                          )}
                        >
                          {link.status}
                        </Badge>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(url).then(
                              () => toast.success('Link copied'),
                              () => toast.error('Could not copy — select the link instead'),
                            );
                          }}
                          title="Copy link"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="Open link"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upload links sent yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agreement ── */}
        <TabsContent value="agreement" className="mt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Agreement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Sent</dt>
                  <dd className="font-medium mt-0.5">{prospect.agreementSentAt ? formatDate(prospect.agreementSentAt) : 'Not sent'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Signed</dt>
                  <dd className="font-medium mt-0.5">
                    {agreementSigned ? formatDate(prospect.agreementSignedAt) : prospect.agreementSentAt ? 'Awaiting signature' : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Commission</dt>
                  <dd className="font-medium mt-0.5">
                    {prospect.agreedCommissionPercent != null ? `${prospect.agreedCommissionPercent}%` : `${commissionPercent}% (proposed)`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-0.5">
                    {agreementSigned ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">Signed</Badge>
                    ) : prospect.agreementSentAt ? (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800">Sent</Badge>
                    ) : (
                      <Badge variant="secondary">Not sent</Badge>
                    )}
                  </dd>
                </div>
              </dl>
              {/* The same rate is used for the agreement and for lots created without one. */}
              <div className="max-w-[12rem]">
                <label htmlFor="commission-input" className="text-sm text-muted-foreground block mb-1">
                  Commission %
                </label>
                <Input
                  id="commission-input"
                  type="number"
                  min={0}
                  max={100}
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  disabled={agreementSigned}
                  title={agreementSigned ? 'Fixed by the signed agreement' : undefined}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestSendAgreement}
                  disabled={agreementSigned || sendingAgreement || !hasAcceptedItems || !prospect.email}
                  title={agreementSigned ? 'Signed agreements are final' : !prospect.email ? 'Add an email to send the agreement' : undefined}
                >
                  {sendingAgreement ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  {prospect.agreementSentAt ? 'Resend' : 'Send agreement'}
                </Button>
                {prospect.agreementSentAt && (
                  <a
                    href={`/consignment-agreement?prospect=${prospect.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View signing page
                  </a>
                )}
              </div>
              {agreementSigned ? (
                <p className="text-xs text-muted-foreground">Signed agreements are final — the sent copy can&apos;t be re-issued.</p>
              ) : !hasAcceptedItems ? (
                <p className="text-xs text-muted-foreground">Accept items on the Items tab before sending an agreement.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Lots (auction placement) ── */}
        <TabsContent value="lots" className="mt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auction placement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="auction-select" className="text-sm text-muted-foreground block mb-1">
                    Assign to sale (optional)
                  </label>
                  <select
                    id="auction-select"
                    value={auctionId}
                    onChange={(e) => setAuctionId(e.target.value)}
                    className={selectClass}
                    disabled={auctionsLoading}
                  >
                    <option value="">{auctionsLoading ? 'Loading sales…' : 'No sale — create lots only'}</option>
                    {auctions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {a.status}{a.biddingStartsAt ? ` · ${formatDate(a.biddingStartsAt)}` : ''}
                      </option>
                    ))}
                  </select>
                  {!auctionsLoading && auctions.length === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      No draft, scheduled, or preview sales — lots will be created unassigned.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Commission</p>
                  <p className="text-sm font-medium h-9 flex items-center gap-2">
                    {commissionPercent}%
                    {!agreementSigned && (
                      <button
                        type="button"
                        className="text-xs font-normal text-champagne-deep hover:underline"
                        onClick={() => selectTab('agreement')}
                      >
                        Change
                      </button>
                    )}
                  </p>
                </div>

                <div className="flex flex-col justify-end">
                  <p className="text-sm text-muted-foreground mb-2">
                    {acceptedCount} accepted item{acceptedCount !== 1 ? 's' : ''} ready for lot creation
                    {acceptedEstLow > 0 && ` (${formatCurrency(acceptedEstLow)} - ${formatCurrency(acceptedEstHigh)} est. value)`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={requestCreateLots}
                  disabled={creatingLots || !hasAcceptedItems}
                  className="bg-champagne text-charcoal hover:bg-champagne/90"
                >
                  {creatingLots ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
                  {auctionId ? 'Create Lots & Assign to Sale' : 'Create Lots'}
                </Button>
                {lotCreatedCount > 0 && (
                  <Link href={lotsSearchHref} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" /> View {lotCreatedCount} lot{lotCreatedCount !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>

              {!hasAcceptedItems ? (
                <p className="text-xs text-muted-foreground">Accept items on the Items tab before creating lots.</p>
              ) : !agreementSigned ? (
                <p className="text-xs text-muted-foreground">
                  The agreement isn&apos;t signed yet — you&apos;ll be asked to confirm creating lots at this commission.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Confirm dialog ── */}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          variant={pending.variant}
          onConfirm={pending.onConfirm}
        />
      )}

      {/* ── Lightbox ── */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent
          className="max-w-5xl w-[calc(100vw-2rem)] p-2 sm:p-4 bg-black/95 border-none text-white"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') stepLightbox(-1);
            if (e.key === 'ArrowRight') stepLightbox(1);
          }}
        >
          <DialogTitle className="sr-only">{lightbox?.title ?? 'Photo'}</DialogTitle>
          {lightbox && currentMedia && (
            <>
              <div className="relative flex items-center justify-center min-h-[40vh]">
                {isVideoUrl(currentMedia) ? (
                  <video
                    key={currentMedia}
                    src={currentMedia}
                    controls
                    playsInline
                    className="max-h-[75vh] max-w-full rounded"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- full-size admin preview of a storage URL
                  <img
                    key={currentMedia}
                    src={currentMedia}
                    alt={`${lightbox.title} ${lightbox.index + 1}`}
                    className="max-h-[75vh] max-w-full object-contain rounded"
                  />
                )}
                {lightbox.media.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => stepLightbox(-1)}
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepLightbox(1)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
                      aria-label="Next"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70 px-1">
                <span>
                  {lightbox.index + 1} / {lightbox.media.length}
                </span>
                <div className="flex items-center gap-3">
                  {!isVideoUrl(currentMedia) && (
                    <LensButton imageUrl={currentMedia} className="text-foreground" />
                  )}
                  <a
                    href={currentMedia}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open original
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit contact sheet ── */}
      <Sheet open={contactOpen} onOpenChange={(o) => !o && setContactOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit contact</SheetTitle>
            <SheetDescription>Contact details, source, and funnel status for this prospect.</SheetDescription>
          </SheetHeader>
          <div className="px-4 space-y-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Full name *</Label>
              <Input id="c-name" value={contactForm.fullName} onChange={(e) => setContactForm((f) => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" type="tel" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-address">Address</Label>
              <Input id="c-address" value={contactForm.address} onChange={(e) => setContactForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="c-city">City</Label>
                <Input id="c-city" value={contactForm.city} onChange={(e) => setContactForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-state">State</Label>
                <Input id="c-state" value={contactForm.state} onChange={(e) => setContactForm((f) => ({ ...f, state: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-zip">ZIP</Label>
                <Input id="c-zip" value={contactForm.zip} onChange={(e) => setContactForm((f) => ({ ...f, zip: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-source">Source</Label>
                <select id="c-source" value={contactForm.source} onChange={(e) => setContactForm((f) => ({ ...f, source: e.target.value as ProspectSource }))} className={selectClass}>
                  {PROSPECT_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-status">Status</Label>
                <select id="c-status" value={contactForm.status} onChange={(e) => setContactForm((f) => ({ ...f, status: e.target.value as ProspectStatus }))} className={selectClass}>
                  {PROSPECT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">Changing status here does not send any email.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes (internal)</Label>
              <Textarea id="c-notes" rows={4} value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setContactOpen(false)} disabled={savingContact}>
              Cancel
            </Button>
            <div className="flex-1" />
            <Button size="sm" className="bg-champagne text-charcoal hover:bg-champagne/90" onClick={handleSaveContact} disabled={savingContact}>
              {savingContact && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Detail Row Helper ──

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
