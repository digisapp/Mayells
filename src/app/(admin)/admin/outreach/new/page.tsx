'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/admin/PageHeader';
import { toast } from 'sonner';
import Link from 'next/link';
import { categoryOptions } from '@/lib/config/outreach';
import { FieldError, readFailure, type FieldErrors } from '../form-utils';

export default function NewOutreachContactPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    title: '',
    email: '',
    phone: '',
    website: '',
    category: 'estate_attorney',
    source: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    nextFollowUpAt: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    try {
      // Empty strings become null server-side; send them as-is so the
      // validation messages map back to the right field.
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, nextFollowUpAt: form.nextFollowUpAt || null }),
      });
      if (!res.ok) {
        const f = await readFailure(res, 'Failed to add contact');
        toast.error(f.error);
        if (f.details) setErrors(f.details);
        return;
      }
      toast.success('Contact added');
      router.push('/admin/outreach');
    } catch {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="New contact" />

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors._form?.[0] && <p className="text-sm text-destructive">{errors._form[0]}</p>}
        <Card>
          <CardHeader><CardTitle>Company</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company name *</Label>
              <Input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} required placeholder="e.g., Smith & Associates Law Firm" aria-invalid={!!errors.companyName} />
              <FieldError errors={errors} name="companyName" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="example.com" aria-invalid={!!errors.website} />
              <FieldError errors={errors} name="website" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
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
                <Input value={form.source} onChange={(e) => update('source', e.target.value)} placeholder="e.g., Google, referral, LinkedIn" />
                <FieldError errors={errors} name="source" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact person</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact name</Label>
              <Input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} placeholder="Full name" />
              <FieldError errors={errors} name="contactName" />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g., Managing Partner" />
              <FieldError errors={errors} name="title" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={!!errors.email} />
              <FieldError errors={errors} name="email" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              <FieldError errors={errors} name="phone" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
              <FieldError errors={errors} name="address" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
                <FieldError errors={errors} name="city" />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => update('state', e.target.value)} placeholder="e.g., FL" />
                <FieldError errors={errors} name="state" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes & Follow-Up</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={4} placeholder="Any relevant details about this lead..." />
              <FieldError errors={errors} name="notes" />
            </div>
            <div className="space-y-2">
              <Label>Next Follow-Up</Label>
              <Input type="date" value={form.nextFollowUpAt} onChange={(e) => update('nextFollowUpAt', e.target.value)} />
              <FieldError errors={errors} name="nextFollowUpAt" />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Link href="/admin/outreach">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Add Contact'}
          </Button>
        </div>
      </form>
    </div>
  );
}
