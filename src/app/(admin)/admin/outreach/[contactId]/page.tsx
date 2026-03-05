'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

const categoryOptions = [
  { value: 'estate_attorney', label: 'Estate Attorney' },
  { value: 'trust_estate_planning', label: 'Trust & Estate Planning' },
  { value: 'elder_law', label: 'Elder Law' },
  { value: 'wealth_management', label: 'Wealth Management' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'cpa_tax', label: 'CPA / Tax Specialist' },
  { value: 'divorce_attorney', label: 'Divorce Attorney' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'estate_liquidator', label: 'Estate Liquidator' },
  { value: 'real_estate', label: 'Real Estate (Luxury)' },
  { value: 'art_advisor', label: 'Art Advisor' },
  { value: 'bank_trust', label: 'Bank Trust Department' },
  { value: 'other', label: 'Other' },
];

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interested', label: 'Interested' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  follow_up: 'bg-orange-100 text-orange-800',
  interested: 'bg-green-100 text-green-800',
  converted: 'bg-emerald-100 text-emerald-800',
  not_interested: 'bg-gray-100 text-gray-600',
  do_not_contact: 'bg-red-100 text-red-600',
};

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export default function EditOutreachContactPage() {
  const router = useRouter();
  const { contactId } = useParams<{ contactId: string }>();
  const [contact, setContact] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    title: '',
    email: '',
    phone: '',
    website: '',
    category: 'other',
    source: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    nextFollowUpAt: '',
    lastContactedAt: '',
  });

  useEffect(() => {
    fetch('/api/admin/outreach')
      .then((r) => r.json())
      .then((d) => {
        const c = (d.data || []).find((item: Record<string, unknown>) => item.id === contactId);
        if (c) {
          setContact(c);
          setForm({
            companyName: (c.companyName as string) || '',
            contactName: (c.contactName as string) || '',
            title: (c.title as string) || '',
            email: (c.email as string) || '',
            phone: (c.phone as string) || '',
            website: (c.website as string) || '',
            category: (c.category as string) || 'other',
            source: (c.source as string) || '',
            address: (c.address as string) || '',
            city: (c.city as string) || '',
            state: (c.state as string) || '',
            notes: (c.notes as string) || '',
            nextFollowUpAt: formatDate(c.nextFollowUpAt as string | null),
            lastContactedAt: formatDate(c.lastContactedAt as string | null),
          });
        }
      });
  }, [contactId]);

  if (!contact) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function updateStatus(newStatus: string) {
    const res = await fetch('/api/admin/outreach', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, status: newStatus, lastContactedAt: new Date().toISOString() }),
    });
    if (res.ok) {
      setContact((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contactId,
          ...form,
          nextFollowUpAt: form.nextFollowUpAt || null,
          lastContactedAt: form.lastContactedAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Contact updated');
      router.push('/admin/outreach');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this contact?')) return;
    setDeleting(true);
    const res = await fetch('/api/admin/outreach', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId }),
    });
    if (res.ok) {
      toast.success('Contact deleted');
      router.push('/admin/outreach');
    } else {
      toast.error('Failed to delete');
      setDeleting(false);
    }
  }

  const status = (contact.status as string) || 'new';

  return (
    <div className="max-w-3xl">
      <Link href="/admin/outreach" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Outreach
      </Link>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Edit Contact</h1>
        <Badge className={statusColors[status]}>{status.replace('_', ' ')}</Badge>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Update Status</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {statusOptions.map((s) => (
            <Button
              key={s.value}
              variant={status === s.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => update('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Input value={form.source} onChange={(e) => update('source', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact Person</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contact Name</Label><Input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} /></div>
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => update('title', e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => update('address', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={form.state} onChange={(e) => update('state', e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Last Contacted</Label>
                <Input type="date" value={form.lastContactedAt} onChange={(e) => update('lastContactedAt', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Next Follow-Up</Label>
                <Input type="date" value={form.nextFollowUpAt} onChange={(e) => update('nextFollowUpAt', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/admin/outreach">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Update Contact'}
          </Button>
        </div>
      </form>

      <div className="mt-8 pt-8 border-t">
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="h-4 w-4 mr-2" />
          {deleting ? 'Deleting...' : 'Delete Contact'}
        </Button>
      </div>
    </div>
  );
}
