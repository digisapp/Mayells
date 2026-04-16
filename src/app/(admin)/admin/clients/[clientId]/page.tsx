'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Mail, Package, Image, DollarSign, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

interface ClientData {
  client: {
    id: string;
    fullName: string | null;
    email: string;
    companyName: string | null;
    phone: string | null;
    bio: string | null;
    createdAt: string;
  };
  consignments: Array<{
    id: string;
    title: string;
    status: string;
    estimatedValue: number | null;
    categorySlug: string;
    createdAt: string;
    reviewNotes: string | null;
  }>;
  lots: Array<{
    id: string;
    title: string;
    status: string;
    saleType: string;
    estimateLow: number | null;
    estimateHigh: number | null;
    hammerPrice: number | null;
    createdAt: string;
  }>;
}

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

export default function AdminClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'consignments' | 'lots'>('lots');
  const [showEmail, setShowEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`)
      .then((r) => r.json())
      .then((d) => setData(d.data ?? null))
      .catch(() => toast.error('Failed to load client data'))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleSendEmail() {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });
      if (res.ok) {
        toast.success('Email sent successfully');
        setShowEmail(false);
        setEmailSubject('');
        setEmailMessage('');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to send email');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/clients')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
        </Button>
        <p className="text-muted-foreground mt-8 text-center">Client not found.</p>
      </div>
    );
  }

  const { client, consignments: cons, lots: clientLots } = data;
  const soldLots = clientLots.filter((l) => l.status === 'sold');
  const totalRevenue = soldLots.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push('/admin/clients')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm">{client.fullName || 'Unnamed Client'}</h1>
          <p className="text-muted-foreground">{client.email}</p>
          {client.companyName && <p className="text-sm text-muted-foreground">{client.companyName}</p>}
          {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Member since {new Date(client.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button
          onClick={() => setShowEmail(!showEmail)}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          <Mail className="h-4 w-4 mr-2" /> Email Summary
        </Button>
      </div>

      {/* Email Panel */}
      {showEmail && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <Input
              placeholder="Subject (optional — defaults to 'Your Item Summary — Mayell')"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <Textarea
              placeholder="Custom message (optional — appears before the item summary)"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSendEmail}
                disabled={sending}
                className="bg-champagne text-charcoal hover:bg-champagne/90"
              >
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
              <Button variant="outline" onClick={() => setShowEmail(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Package className="h-4 w-4" /> Consignments
            </div>
            <p className="text-2xl font-semibold">{cons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Image className="h-4 w-4" /> Lots
            </div>
            <p className="text-2xl font-semibold">{clientLots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle className="h-4 w-4" /> Sold
            </div>
            <p className="text-2xl font-semibold">{soldLots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" /> Revenue
            </div>
            <p className="text-2xl font-semibold">{totalRevenue > 0 ? formatCurrency(totalRevenue) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={tab === 'lots' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('lots')}
          className={tab === 'lots' ? 'bg-champagne text-charcoal hover:bg-champagne/90' : ''}
        >
          Lots ({clientLots.length})
        </Button>
        <Button
          variant={tab === 'consignments' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('consignments')}
          className={tab === 'consignments' ? 'bg-champagne text-charcoal hover:bg-champagne/90' : ''}
        >
          Consignments ({cons.length})
        </Button>
      </div>

      {/* Lots Table */}
      {tab === 'lots' && (
        clientLots.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No lots found for this client.
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Estimate</th>
                  <th className="px-4 py-3 font-medium">Hammer Price</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {clientLots.map((lot) => (
                  <tr key={lot.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{lot.title}</td>
                    <td className="px-4 py-3 capitalize">{lot.saleType}</td>
                    <td className="px-4 py-3">
                      <Badge className={lotStatusBadge[lot.status] ?? ''} variant="secondary">
                        {lot.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {lot.estimateLow && lot.estimateHigh
                        ? `${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {lot.hammerPrice ? formatCurrency(lot.hammerPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(lot.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Consignments Table */}
      {tab === 'consignments' && (
        cons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No consignments found for this client.
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
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
                {cons.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{c.title}</td>
                    <td className="px-4 py-3 capitalize">{c.categorySlug}</td>
                    <td className="px-4 py-3">
                      <Badge className={consignmentStatusBadge[c.status] ?? ''} variant="secondary">
                        {c.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.estimatedValue ? formatCurrency(c.estimatedValue) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
