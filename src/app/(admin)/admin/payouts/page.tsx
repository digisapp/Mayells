'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Banknote, CircleDollarSign } from 'lucide-react';

interface PayoutRow {
  payout: {
    id: string;
    status: 'pending' | 'paid' | 'cancelled';
    hammerPrice: number;
    commissionPercent: number;
    commissionAmount: number;
    netAmount: number;
    method: string | null;
    reference: string | null;
    paidAt: string | null;
    createdAt: string;
  };
  seller: { id: string; fullName: string | null; email: string };
  lot: { id: string; title: string };
  invoice: { id: string; invoiceNumber: string; status: string };
}

const statusColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  paid: 'default',
  cancelled: 'destructive',
};

const METHODS = ['wire', 'check', 'other'] as const;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('wire');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch('/api/admin/payouts')
      .then(res => res.json())
      .then(data => { setRows(data.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const markPaid = async (payoutId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/${payoutId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to mark payout paid');
      } else {
        setMarkingId(null);
        setReference('');
        load();
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="font-display text-display-sm mb-6">Payouts</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  const pending = rows.filter(r => r.payout.status === 'pending');
  const paid = rows.filter(r => r.payout.status === 'paid');
  const pendingTotal = pending.reduce((sum, r) => sum + r.payout.netAmount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <Banknote className="h-6 w-6" />
            Payouts
          </h1>
          <p className="text-muted-foreground mt-1">Seller settlements — created when the buyer&apos;s invoice is paid</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            {pending.length} pending · {formatCents(pendingTotal)} owed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {paid.length} paid
          </span>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <CircleDollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No payouts yet. They appear here once a buyer pays an invoice.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/50">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Seller</th>
                <th className="text-left px-4 py-3 font-medium">Lot</th>
                <th className="text-right px-4 py-3 font-medium">Hammer</th>
                <th className="text-right px-4 py-3 font-medium">Commission</th>
                <th className="text-right px-4 py-3 font-medium">Net to seller</th>
                <th className="text-left px-4 py-3 font-medium">Payment</th>
                <th className="text-left px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ payout, seller, lot, invoice }) => (
                <tr key={payout.id} className="border-b border-border/30 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <Badge variant={statusColors[payout.status] || 'outline'}>{payout.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{seller.fullName || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{seller.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[220px] truncate" title={lot.title}>{lot.title}</div>
                    <div className="text-xs text-muted-foreground">{invoice.invoiceNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCents(payout.hammerPrice)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCents(payout.commissionAmount)}
                    <span className="text-xs ml-1">({payout.commissionPercent}%)</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCents(payout.netAmount)}</td>
                  <td className="px-4 py-3">
                    {payout.status === 'paid' ? (
                      <div>
                        <span className="capitalize">{payout.method || '—'}</span>
                        {payout.reference && <span className="font-mono text-xs ml-1">({payout.reference})</span>}
                        <div className="text-xs text-muted-foreground">
                          {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        created {new Date(payout.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payout.status === 'pending' && markingId !== payout.id && (
                      <button
                        type="button"
                        onClick={() => { setMarkingId(payout.id); setError(null); }}
                        className="text-xs px-3 py-1.5 rounded-md border border-border/50 hover:bg-accent/10 transition-colors"
                      >
                        Mark paid
                      </button>
                    )}
                    {markingId === payout.id && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={method}
                            onChange={e => setMethod(e.target.value as typeof METHODS[number])}
                            className="text-xs border border-border/50 rounded-md px-1.5 py-1 bg-background"
                          >
                            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input
                            value={reference}
                            onChange={e => setReference(e.target.value)}
                            placeholder="Reference #"
                            className="text-xs border border-border/50 rounded-md px-1.5 py-1 w-28 bg-background"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => markPaid(payout.id)}
                            className="text-xs px-2 py-1 rounded-md bg-foreground text-background disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMarkingId(null)}
                            className="text-xs px-2 py-1 rounded-md border border-border/50"
                          >
                            Cancel
                          </button>
                        </div>
                        {error && <span className="text-xs text-destructive">{error}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
