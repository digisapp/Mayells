'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { Trash2, PhoneCall, Mail, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { OutreachContact } from '@/db/schema/outreach';
import { categoryOptions, statusOptions, statusColors, statusLabels } from '@/lib/config/outreach';
import { FieldError, readFailure, type FieldErrors, formatDay } from './../form-utils';

interface SentEmail {
  id: string;
  subject: string | null;
  status: string;
  threadId: string | null;
  createdAt: string;
  hasResponse: boolean;
}

type FormState = {
  companyName: string;
  contactName: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  category: string;
  source: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  nextFollowUpAt: string;
  lastContactedAt: string;
};

function toDateInput(d: string | null | undefined): string {
  if (!d) return '';
  // Date-only values (nextFollowUpAt) come through as YYYY-MM-DD already;
  // timestamps are shown as the local calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function formFrom(c: OutreachContact): FormState {
  return {
    companyName: c.companyName || '',
    contactName: c.contactName || '',
    title: c.title || '',
    email: c.email || '',
    phone: c.phone || '',
    website: c.website || '',
    category: c.category || 'other',
    source: c.source || '',
    address: c.address || '',
    city: c.city || '',
    state: c.state || '',
    notes: c.notes || '',
    nextFollowUpAt: toDateInput(c.nextFollowUpAt),
    lastContactedAt: toDateInput(c.lastContactedAt as unknown as string | null),
  };
}

export default function EditOutreachContactPage() {
  const router = useRouter();
  const { contactId } = useParams<{ contactId: string }>();
  const [contact, setContact] = useState<OutreachContact | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'not_found' | 'error'>('loading');
  const [isLoading, setIsLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [sentEmails, setSentEmails] = useState<SentEmail[] | null>(null);

  const applyContact = useCallback((c: OutreachContact) => {
    setContact(c);
    // Sync the date fields from the server so a status change or "log
    // contact" is reflected in the form without a reload.
    setForm((prev) => {
      const fresh = formFrom(c);
      return prev ? { ...prev, lastContactedAt: fresh.lastContactedAt, nextFollowUpAt: prev.nextFollowUpAt } : fresh;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/outreach?id=${contactId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404 || r.status === 400) {
          setLoadState('not_found');
          return;
        }
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (cancelled) return;
        setContact(d.data);
        setForm(formFrom(d.data));
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [contactId]);

  // Emails we've sent to this contact (newest first)
  const email = contact?.email;
  useEffect(() => {
    if (!email) {
      setSentEmails([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ direction: 'outbound', search: email });
    fetch(`/api/admin/emails?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        const rows = (d.data ?? []) as Array<SentEmail & { toEmail: string }>;
        setSentEmails(rows.filter((m) => m.toEmail.toLowerCase() === email.toLowerCase()));
      })
      .catch(() => { if (!cancelled) setSentEmails([]); });
    return () => { cancelled = true; };
  }, [email]);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function patch(body: Record<string, unknown>, busyKey: string, successMessage: string): Promise<OutreachContact | null> {
    setStatusBusy(busyKey);
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, ...body }),
      });
      if (!res.ok) {
        const f = await readFailure(res, 'Update failed');
        toast.error(f.error);
        if (f.details) setErrors(f.details);
        return null;
      }
      const d = await res.json();
      applyContact(d.data);
      toast.success(successMessage);
      return d.data;
    } catch {
      toast.error('Network error');
      return null;
    } finally {
      setStatusBusy(null);
    }
  }

  async function updateStatus(newStatus: string) {
    await patch({ status: newStatus }, `status:${newStatus}`, `Status updated to ${statusLabels[newStatus as keyof typeof statusLabels] ?? newStatus}`);
  }

  async function logContact() {
    await patch({ logContact: true }, 'log', 'Contact logged');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !form) return;
    // Only fields that changed go over the wire
    const initial = formFrom(contact);
    const changed: Record<string, string | null> = {};
    (Object.keys(form) as Array<keyof FormState>).forEach((k) => {
      if (form[k] !== initial[k]) changed[k] = form[k] === '' ? null : form[k];
    });
    if (Object.keys(changed).length === 0) {
      toast.info('No changes to save');
      return;
    }
    setIsLoading(true);
    setErrors({});
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, ...changed }),
      });
      if (!res.ok) {
        const f = await readFailure(res, 'Failed to update');
        toast.error(f.error);
        if (f.details) setErrors(f.details);
        return;
      }
      const d = await res.json();
      setContact(d.data);
      setForm(formFrom(d.data));
      toast.success('Contact updated');
      router.push('/admin/outreach');
    } catch {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    const res = await fetch('/api/admin/outreach', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId }),
    }).catch(() => null);
    if (res?.ok) {
      toast.success('Contact deleted');
      router.push('/admin/outreach');
    } else {
      toast.error(res ? (await readFailure(res, 'Failed to delete')).error : 'Network error');
    }
  }

  if (loadState !== 'loaded' || !contact || !form) {
    return (
      <div className="max-w-3xl">
        {loadState === 'not_found' ? (
          <p className="text-muted-foreground">Contact not found. It may have been deleted.</p>
        ) : loadState === 'error' ? (
          <p className="text-destructive">Failed to load contact. Please try again.</p>
        ) : (
          <div className="text-muted-foreground">Loading...</div>
        )}
      </div>
    );
  }

  const status = contact.status;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={contact.companyName}
        badges={<Badge className={statusColors[status]}>{statusLabels[status] ?? status}</Badge>}
        description={[contact.contactName, contact.title].filter(Boolean).join(' · ') || undefined}
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((s) => (
              <Button
                key={s.value}
                variant={status === s.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateStatus(s.value)}
                disabled={!!statusBusy || status === s.value}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Last contacted: <strong className="text-foreground">{contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleString() : 'never'}</strong>
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={logContact} disabled={!!statusBusy}>
              <PhoneCall className="h-3.5 w-3.5 mr-1" /> Log contact now
            </Button>
            {contact.nextFollowUpAt && (
              <span>Next follow-up: <strong className="text-foreground">{formatDay(contact.nextFollowUpAt)}</strong></span>
            )}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors._form?.[0] && <p className="text-sm text-destructive">{errors._form[0]}</p>}
        <Card>
          <CardHeader><CardTitle>Company</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company name *</Label>
              <Input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} required aria-invalid={!!errors.companyName} />
              <FieldError errors={errors} name="companyName" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="example.com" aria-invalid={!!errors.website} />
              <FieldError errors={errors} name="website" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <FieldError errors={errors} name="category" />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Input value={form.source} onChange={(e) => update('source', e.target.value)} />
                <FieldError errors={errors} name="source" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact person</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contact name</Label><Input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} /><FieldError errors={errors} name="contactName" /></div>
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => update('title', e.target.value)} /><FieldError errors={errors} name="title" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={!!errors.email} /><FieldError errors={errors} name="email" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} /><FieldError errors={errors} name="phone" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => update('address', e.target.value)} /><FieldError errors={errors} name="address" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => update('city', e.target.value)} /><FieldError errors={errors} name="city" /></div>
              <div className="space-y-2"><Label>State</Label><Input value={form.state} onChange={(e) => update('state', e.target.value)} /><FieldError errors={errors} name="state" /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={4} />
              <FieldError errors={errors} name="notes" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Last contacted</Label>
                <Input type="date" value={form.lastContactedAt} onChange={(e) => update('lastContactedAt', e.target.value)} />
                <FieldError errors={errors} name="lastContactedAt" />
              </div>
              <div className="space-y-2">
                <Label>Next Follow-Up</Label>
                <Input type="date" value={form.nextFollowUpAt} onChange={(e) => update('nextFollowUpAt', e.target.value)} />
                <FieldError errors={errors} name="nextFollowUpAt" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Link href="/admin/outreach">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Update Contact'}
          </Button>
        </div>
      </form>

      {/* Emails sent */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Emails sent</CardTitle>
        </CardHeader>
        <CardContent>
          {!contact.email ? (
            <p className="text-sm text-muted-foreground">No email address on file.</p>
          ) : sentEmails === null ? (
            <div className="h-10 bg-muted animate-pulse rounded" />
          ) : sentEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent to {contact.email} yet.</p>
          ) : (
            <ul className="divide-y">
              {sentEmails.map((m) => (
                <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {m.subject || '(no subject)'}
                    {m.hasResponse && <Badge className="ml-2 bg-green-100 text-green-800">Replied</Badge>}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap">
                    <Badge variant="outline">{m.status}</Badge>
                    {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    <Link href={`/admin/emails?thread=${m.threadId || m.id}`} className="inline-flex items-center gap-1 text-champagne hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 pt-8 border-t">
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Contact
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${contact.companyName}?`}
        description="The contact and its notes are removed permanently. Emails already sent stay in the inbox."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
