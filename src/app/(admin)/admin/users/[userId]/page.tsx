'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import {
  ArrowLeft, Mail, Package, Image as ImageIcon, DollarSign, CheckCircle, Gavel, Receipt,
  Wallet, StickyNote, EyeOff, ShieldCheck, BadgeCheck, Hash, Loader2, ExternalLink, Users2,
} from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';
import {
  verificationLabel, roleColors, accountStatusColors, USER_ROLES, ACCOUNT_STATUSES, readError,
} from '../user-badges';

// ─── Types (mirror GET /api/admin/users/[userId]) ────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  isShadow: boolean;
  fullName: string | null;
  displayName: string | null;
  role: string;
  isAdmin: boolean;
  accountStatus: string;
  cardVerifiedAt: string | null;
  identityVerifiedAt: string | null;
  paddleNumber: string | null;
  phone: string | null;
  companyName: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  adminNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface UserDetail {
  user: UserProfile;
  stats: {
    lotCount: number;
    soldCount: number;
    salesTotalCents: number;
    consignmentCount: number;
    bidCount: number;
    invoiceCount: number;
    purchasesTotalCents: number;
    payoutPendingCents: number;
  };
  consignments: Array<{
    id: string; title: string; status: string; estimatedValue: number | null;
    categorySlug: string; lotId: string | null; reviewNotes: string | null; createdAt: string | null;
  }>;
  lots: Array<{
    id: string; lotNumber: number | null; title: string; status: string; saleType: string;
    estimateLow: number | null; estimateHigh: number | null; hammerPrice: number | null;
    primaryImageUrl: string | null; createdAt: string | null;
  }>;
  bids: Array<{
    id: string; amount: number; maxBidAmount: number | null; bidType: string; status: string;
    createdAt: string | null; lotId: string; lotTitle: string; lotStatus: string; lotNumber: number | null;
  }>;
  invoices: Array<{
    id: string; invoiceNumber: string; status: string; hammerPrice: number; totalAmount: number;
    dueDate: string; paidAt: string | null; createdAt: string | null; lotId: string; lotTitle: string;
  }>;
  payouts: Array<{
    id: string; status: string; hammerPrice: number; commissionPercent: number; commissionAmount: number;
    netAmount: number; method: string | null; reference: string | null; paidAt: string | null;
    createdAt: string | null; lotId: string; lotTitle: string;
  }>;
  emails: Array<{
    id: string; direction: 'inbound' | 'outbound'; status: string; subject: string | null;
    fromEmail: string; toEmail: string; threadId: string | null; aiAutoSent: boolean;
    readAt: string | null; createdAt: string;
  }>;
  prospect: { id: string; status: string; fullName: string } | null;
}

// ─── Badge palettes ──────────────────────────────────────────────────────────

const consignmentStatusBadge: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  listed: 'bg-champagne/20 text-champagne',
  sold: 'bg-green-100 text-green-800',
  returned: 'bg-gray-100 text-gray-800',
};

const lotStatusBadge: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  for_sale: 'bg-blue-100 text-blue-800',
  in_auction: 'bg-purple-100 text-purple-800',
  sold: 'bg-green-100 text-green-800',
  unsold: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-800',
};

const bidStatusBadge: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800',
  winning: 'bg-green-100 text-green-800',
  won: 'bg-emerald-100 text-emerald-800',
  outbid: 'bg-gray-100 text-gray-700',
  retracted: 'bg-red-100 text-red-800',
};

const invoiceStatusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  refunded: 'bg-purple-100 text-purple-800',
};

const payoutStatusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const emailStatusBadge: Record<string, string> = {
  received: 'bg-blue-100 text-blue-800',
  read: 'bg-gray-100 text-gray-800',
  replied: 'bg-green-100 text-green-800',
  sent: 'bg-champagne/20 text-champagne',
  delivered: 'bg-green-100 text-green-800',
  bounced: 'bg-red-100 text-red-800',
};

function fmtDate(d: string | null | undefined, withTime = false): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : undefined);
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Email summary panel
  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Notes
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  // Confirmations for privilege-raising / destructive account changes
  const [pending, setPending] = useState<{
    updates: Record<string, unknown>; title: string; description: string; confirmLabel: string; destructive: boolean;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/users/${userId}`)
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return;
        }
        if (!r.ok) throw new Error(await readError(r, 'Failed to load user'));
        const d = await r.json();
        setData(d.data ?? null);
        setNotes(d.data?.user?.adminNotes ?? '');
        setNotesDirty(false);
        setLoadError(null);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        toast.error(err.message || 'Failed to load user');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function patchUser(updates: Record<string, unknown>, label = 'update') {
    setSaving(label);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        toast.error(await readError(res, 'Failed to update user'));
        return false;
      }
      const { data: updated } = await res.json();
      setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...updated } } : prev));
      toast.success('Saved');
      return true;
    } catch {
      toast.error('Network error');
      return false;
    } finally {
      setSaving(null);
    }
  }

  function requestAccountChange(updates: { role?: string; accountStatus?: string; isAdmin?: boolean }) {
    if (!data) return;
    const name = data.user.fullName || data.user.email;
    if ((updates.role === 'admin' && data.user.role !== 'admin') || (updates.isAdmin === true && !data.user.isAdmin)) {
      setPending({
        updates,
        title: `Give ${name} admin access?`,
        description: 'Admins can see and change everything in this panel, including money, users, and other admins.',
        confirmLabel: 'Grant admin',
        destructive: false,
      });
      return;
    }
    if (updates.accountStatus && ['banned', 'suspended'].includes(updates.accountStatus) && updates.accountStatus !== data.user.accountStatus) {
      setPending({
        updates,
        title: `${updates.accountStatus === 'banned' ? 'Ban' : 'Suspend'} ${name}?`,
        description: updates.accountStatus === 'banned'
          ? 'They will be blocked from bidding and buying. Existing invoices and payouts are unaffected.'
          : 'They will be blocked from bidding until reactivated.',
        confirmLabel: updates.accountStatus === 'banned' ? 'Ban user' : 'Suspend',
        destructive: true,
      });
      return;
    }
    void patchUser(updates, 'account');
  }

  async function handleSendEmail() {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });
      if (res.ok) {
        toast.success('Summary email sent');
        setShowEmail(false);
        setEmailSubject('');
        setEmailMessage('');
        load();
      } else {
        toast.error(await readError(res, 'Failed to send email'));
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  // ─── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
        </Button>
        <p className="text-muted-foreground mt-8 text-center">
          {notFound ? 'User not found.' : loadError || 'Failed to load user. Please try again.'}
        </p>
        {!notFound && (
          <div className="text-center mt-4">
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        )}
      </div>
    );
  }

  const { user, stats } = data;
  const verification = verificationLabel(user);
  const name = user.fullName || user.displayName || (user.isShadow ? 'Shadow consignor' : user.email);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push('/admin/users')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Users
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-display-sm flex flex-wrap items-center gap-2">
            {name}
            {user.isShadow && (
              <Badge variant="outline" className="gap-1 font-sans text-xs font-normal"><EyeOff className="h-3 w-3" />no email on file</Badge>
            )}
          </h1>
          {!user.isShadow && <p className="text-muted-foreground break-all">{user.email}</p>}
          {user.companyName && <p className="text-sm text-muted-foreground">{user.companyName}</p>}
          {user.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
          {(user.shippingAddress || user.shippingCity) && (
            <p className="text-sm text-muted-foreground">
              {[user.shippingAddress, user.shippingCity, user.shippingState, user.shippingZip].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Member since {fmtDate(user.createdAt)}
            {data.prospect && (
              <>
                {' · '}
                <Link href={`/admin/prospects/${data.prospect.id}`} className="inline-flex items-center gap-1 text-champagne hover:underline">
                  <Users2 className="h-3 w-3" /> Seller prospect ({humanize(data.prospect.status)})
                </Link>
              </>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowEmail(!showEmail)}
          disabled={user.isShadow}
          title={user.isShadow ? 'This account has no email on file' : undefined}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          <Mail className="h-4 w-4 mr-2" /> Email Summary
        </Button>
      </div>

      {/* Email Panel */}
      {showEmail && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <p className="text-xs text-muted-foreground">
              Sends a summary of live and sold lots plus consignments to {user.email}. Replies go to info@mayells.com.
            </p>
            <Input
              placeholder="Subject (optional — defaults to 'Your Item Summary — Mayells')"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <Textarea
              placeholder="Custom message (optional — appears before the item summary)"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSendEmail} disabled={sending} className="bg-champagne text-charcoal hover:bg-champagne/90">
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
              <Button variant="outline" onClick={() => setShowEmail(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Role</p>
              <div className="flex items-center gap-2">
                <select
                  value={user.role}
                  onChange={(e) => requestAccountChange({ role: e.target.value })}
                  disabled={saving === 'account'}
                  className="text-sm border rounded px-2 py-1.5 bg-background"
                >
                  {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <Badge className={roleColors[user.role] || ''}>{user.role}</Badge>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={user.isAdmin}
                  disabled={saving === 'account'}
                  onChange={(e) => requestAccountChange({ isAdmin: e.target.checked })}
                />
                <ShieldCheck className="h-3.5 w-3.5 text-red-700" />
                Admin flag (is_admin)
              </label>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Account status</p>
              <div className="flex items-center gap-2">
                <select
                  value={user.accountStatus}
                  onChange={(e) => requestAccountChange({ accountStatus: e.target.value })}
                  disabled={saving === 'account'}
                  className="text-sm border rounded px-2 py-1.5 bg-background"
                >
                  {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Badge className={accountStatusColors[user.accountStatus] || ''}>{user.accountStatus}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Verification</p>
              <Badge className={verification.className}>{verification.label}</Badge>
              <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                <p>Registered {fmtDate(user.createdAt)}</p>
                <p>Card {user.cardVerifiedAt ? fmtDate(user.cardVerifiedAt) : '— not on file'}</p>
                <p>ID {user.identityVerifiedAt ? fmtDate(user.identityVerifiedAt) : '— not verified'}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.identityVerifiedAt ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving === 'identity'}
                    onClick={() => patchUser({ identityVerified: false }, 'identity')}>
                    Clear ID verification
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving === 'identity'}
                    onClick={() => patchUser({ identityVerified: true }, 'identity')}>
                    <BadgeCheck className="h-3.5 w-3.5 mr-1" /> Mark ID verified
                  </Button>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Paddle</p>
              <p className="text-lg font-semibold tabular-nums">{user.paddleNumber ? `#${user.paddleNumber}` : '—'}</p>
              {!user.paddleNumber && (
                <Button size="sm" variant="outline" className="h-7 text-xs mt-1" disabled={saving === 'paddle'}
                  onClick={() => patchUser({ assignPaddle: true }, 'paddle')}>
                  {saving === 'paddle' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Hash className="h-3.5 w-3.5 mr-1" />}
                  Assign paddle
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Package className="h-4 w-4" /> Consignments</div>
            <p className="text-2xl font-semibold">{stats.consignmentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><ImageIcon className="h-4 w-4" /> Lots</div>
            <p className="text-2xl font-semibold">{stats.lotCount} <span className="text-sm font-normal text-muted-foreground">· {stats.soldCount} sold</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><DollarSign className="h-4 w-4" /> Sales (hammer)</div>
            <p className="text-2xl font-semibold">{stats.salesTotalCents > 0 ? formatCurrency(stats.salesTotalCents) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Gavel className="h-4 w-4" /> Bids</div>
            <p className="text-2xl font-semibold">{stats.bidCount} <span className="text-sm font-normal text-muted-foreground">· {stats.purchasesTotalCents > 0 ? `${formatCurrency(stats.purchasesTotalCents)} bought` : `${stats.invoiceCount} invoices`}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="selling">
        <TabsList variant="line" className="flex-wrap h-auto">
          <TabsTrigger value="selling"><Package className="h-3.5 w-3.5 mr-1" />Consignments & Lots</TabsTrigger>
          <TabsTrigger value="buying"><Gavel className="h-3.5 w-3.5 mr-1" />Bids & Purchases</TabsTrigger>
          <TabsTrigger value="payouts"><Wallet className="h-3.5 w-3.5 mr-1" />Payouts{stats.payoutPendingCents > 0 && <Badge className="ml-1 bg-yellow-100 text-yellow-800">{formatCurrency(stats.payoutPendingCents)}</Badge>}</TabsTrigger>
          <TabsTrigger value="emails"><Mail className="h-3.5 w-3.5 mr-1" />Emails ({data.emails.length})</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-3.5 w-3.5 mr-1" />Notes{user.adminNotes && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-champagne" />}</TabsTrigger>
        </TabsList>

        {/* ── Consignments & Lots ── */}
        <TabsContent value="selling" className="space-y-6">
          <div>
            <h2 className="text-sm font-medium mb-2">Lots ({data.lots.length})</h2>
            {data.lots.length === 0 ? (
              <EmptyRow>No lots for this person.</EmptyRow>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Estimate</th>
                      <th className="px-4 py-3 font-medium">Hammer</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lots.map((lot) => (
                      <tr key={lot.id} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/admin/lots/${lot.id}`} className="hover:underline inline-flex items-center gap-1">
                            {lot.lotNumber ? <span className="text-muted-foreground tabular-nums">#{lot.lotNumber}</span> : null}
                            {lot.title}
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        </td>
                        <td className="px-4 py-3 capitalize">{lot.saleType}</td>
                        <td className="px-4 py-3"><Badge className={lotStatusBadge[lot.status] ?? ''} variant="secondary">{humanize(lot.status)}</Badge></td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {lot.estimateLow && lot.estimateHigh ? `${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh)}` : '—'}
                        </td>
                        <td className="px-4 py-3">{lot.hammerPrice ? formatCurrency(lot.hammerPrice) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(lot.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium mb-2">Consignments ({data.consignments.length})</h2>
            {data.consignments.length === 0 ? (
              <EmptyRow>No consignments for this person.</EmptyRow>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Est. Value</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consignments.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          {c.lotId ? (
                            <Link href={`/admin/lots/${c.lotId}`} className="hover:underline inline-flex items-center gap-1">
                              {c.title} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                          ) : c.title}
                        </td>
                        <td className="px-4 py-3 capitalize">{c.categorySlug}</td>
                        <td className="px-4 py-3"><Badge className={consignmentStatusBadge[c.status] ?? ''} variant="secondary">{humanize(c.status)}</Badge></td>
                        <td className="px-4 py-3">{c.estimatedValue ? formatCurrency(c.estimatedValue) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Bids & Purchases ── */}
        <TabsContent value="buying" className="space-y-6">
          <div>
            <h2 className="text-sm font-medium mb-2">Invoices ({data.invoices.length})</h2>
            {data.invoices.length === 0 ? (
              <EmptyRow>No purchases yet.</EmptyRow>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Lot</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Total</th>
                      <th className="px-4 py-3 font-medium">Due</th>
                      <th className="px-4 py-3 font-medium">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          <Link href={`/admin/invoices?q=${encodeURIComponent(inv.invoiceNumber)}`} className="hover:underline inline-flex items-center gap-1">
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />{inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3"><Link href={`/admin/lots/${inv.lotId}`} className="hover:underline">{inv.lotTitle}</Link></td>
                        <td className="px-4 py-3"><Badge className={invoiceStatusBadge[inv.status] ?? ''} variant="secondary">{inv.status}</Badge></td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(inv.totalAmount)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{inv.paidAt ? fmtDate(inv.paidAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium mb-2">Bids ({data.bids.length}{data.bids.length === 200 ? '+' : ''})</h2>
            {data.bids.length === 0 ? (
              <EmptyRow>No bids placed.</EmptyRow>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-4 py-3 font-medium">Lot</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Max</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bids.map((b) => (
                      <tr key={b.id} className="border-t">
                        <td className="px-4 py-3">
                          <Link href={`/admin/lots/${b.lotId}`} className="hover:underline">
                            {b.lotNumber ? <span className="text-muted-foreground tabular-nums mr-1">#{b.lotNumber}</span> : null}{b.lotTitle}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">{humanize(b.lotStatus)}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(b.amount)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{b.maxBidAmount ? formatCurrency(b.maxBidAmount) : '—'}</td>
                        <td className="px-4 py-3 capitalize">{b.bidType}</td>
                        <td className="px-4 py-3"><Badge className={bidStatusBadge[b.status] ?? ''} variant="secondary">{b.status}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(b.createdAt, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Payouts ── */}
        <TabsContent value="payouts">
          {data.payouts.length === 0 ? (
            <EmptyRow>No payouts for this seller.</EmptyRow>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-4 py-3 font-medium">Lot</th>
                    <th className="px-4 py-3 font-medium">Hammer</th>
                    <th className="px-4 py-3 font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Net</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-3"><Link href={`/admin/lots/${p.lotId}`} className="hover:underline">{p.lotTitle}</Link></td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(p.hammerPrice)}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatCurrency(p.commissionAmount)} ({p.commissionPercent}%)</td>
                      <td className="px-4 py-3 tabular-nums font-medium">{formatCurrency(p.netAmount)}</td>
                      <td className="px-4 py-3"><Badge className={payoutStatusBadge[p.status] ?? ''} variant="secondary">{p.status}</Badge></td>
                      <td className="px-4 py-3 capitalize">{p.method ?? '—'}{p.reference ? <span className="text-xs text-muted-foreground ml-1">{p.reference}</span> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.paidAt ? fmtDate(p.paidAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            <Link href="/admin/payouts" className="hover:underline">Manage payouts →</Link>
          </p>
        </TabsContent>

        {/* ── Emails ── */}
        <TabsContent value="emails">
          {data.emails.length === 0 ? (
            <EmptyRow>{user.isShadow ? 'No email on file, so there is no correspondence.' : 'No emails with this address yet.'}</EmptyRow>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-4 py-3 font-medium">Direction</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.emails.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline">{m.direction === 'inbound' ? 'From them' : 'To them'}</Badge>
                        {m.aiAutoSent && <Badge className="ml-1 bg-purple-100 text-purple-700">AI</Badge>}
                      </td>
                      <td className={`px-4 py-3 ${m.direction === 'inbound' && !m.readAt ? 'font-semibold' : ''}`}>{m.subject || '(no subject)'}</td>
                      <td className="px-4 py-3"><Badge className={emailStatusBadge[m.status] ?? ''} variant="secondary">{m.status}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(m.createdAt, true)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link href={`/admin/emails?thread=${m.threadId || m.id}`} className="text-champagne hover:underline text-xs">
                          Open in inbox →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Notes ── */}
        <TabsContent value="notes">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-xs text-muted-foreground">Internal only — never shown to the client.</p>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                rows={8}
                placeholder="Preferences, history, things to remember before the next call…"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={!notesDirty || saving === 'notes'}
                  onClick={async () => { if (await patchUser({ adminNotes: notes }, 'notes')) setNotesDirty(false); }}
                  className="bg-champagne text-charcoal hover:bg-champagne/90"
                >
                  {saving === 'notes' ? 'Saving…' : 'Save notes'}
                </Button>
                {notesDirty && (
                  <Button size="sm" variant="ghost" onClick={() => { setNotes(user.adminNotes ?? ''); setNotesDirty(false); }}>
                    Discard
                  </Button>
                )}
                {user.updatedAt && !notesDirty && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Last saved {fmtDate(user.updatedAt, true)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel}
        variant={pending?.destructive ? 'destructive' : 'default'}
        onConfirm={async () => { if (pending) await patchUser(pending.updates, 'account'); }}
      />
    </div>
  );
}
