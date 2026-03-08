'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Download, Mail, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachContact } from '@/db/schema/outreach';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  follow_up: 'bg-orange-100 text-orange-800',
  interested: 'bg-green-100 text-green-800',
  converted: 'bg-emerald-100 text-emerald-800',
  not_interested: 'bg-gray-100 text-gray-600',
  do_not_contact: 'bg-red-100 text-red-600',
};

const categoryLabels: Record<string, string> = {
  estate_attorney: 'Estate Attorney',
  trust_estate_planning: 'Trust & Estate',
  elder_law: 'Elder Law',
  wealth_management: 'Wealth Mgmt',
  family_office: 'Family Office',
  cpa_tax: 'CPA / Tax',
  divorce_attorney: 'Divorce Attorney',
  insurance: 'Insurance',
  estate_liquidator: 'Liquidator',
  real_estate: 'Real Estate',
  art_advisor: 'Art Advisor',
  bank_trust: 'Bank Trust',
  other: 'Other',
};

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interested', label: 'Interested' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];

const EMAIL_TEMPLATES = [
  {
    name: 'Initial Outreach',
    subject: 'Partnership Opportunity with Mayells Auction House',
    body: `Dear {contactName},

I'm reaching out from Mayells, a luxury auction house specializing in art, antiques, jewelry, and fine collectibles.

We frequently work with professionals in your field and would love to explore how we might be a resource for your clients — whether they're looking to sell estate items, get professional appraisals, or find unique pieces.

Would you be open to a brief call to discuss how we might work together?

Best regards,
Mayells Team`,
  },
  {
    name: 'Follow-Up',
    subject: 'Following up — Mayells Partnership',
    body: `Dear {contactName},

I wanted to follow up on my previous message about a potential partnership between your firm and Mayells.

We offer complimentary appraisals and can handle the entire process of selling estate items — from cataloging to marketing to auction. This can be a valuable service for your clients going through estate transitions.

I'd welcome the chance to meet briefly and share more. What does your schedule look like this week?

Best regards,
Mayells Team`,
  },
  {
    name: 'Services Overview',
    subject: 'How Mayells Can Help Your Clients',
    body: `Dear {contactName},

I wanted to share a quick overview of the services Mayells offers that may benefit your clients:

• Free Appraisals — Expert valuations for estate planning, insurance, or sale purposes
• Estate Liquidation — Full-service handling of estate collections
• Auction Consignment — Maximum market exposure for high-value items
• Private Sales — Discreet handling of sensitive transactions

We handle everything from pickup to payment, and our team has decades of experience with luxury goods.

Would you like to schedule a brief meeting to discuss referral opportunities?

Best regards,
Mayells Team`,
  },
];

interface Props {
  initialContacts: OutreachContact[];
}

export function OutreachClient({ initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState(0);
  const [emailSubject, setEmailSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [emailBody, setEmailBody] = useState(EMAIL_TEMPLATES[0].body);

  // Filter contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = c.companyName.toLowerCase().includes(q) ||
          (c.contactName?.toLowerCase().includes(q)) ||
          (c.email?.toLowerCase().includes(q)) ||
          (c.city?.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (statusFilter && statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (categoryFilter && categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      return true;
    });
  }, [contacts, searchQuery, statusFilter, categoryFilter]);

  const stats = useMemo(() => ({
    total: contacts.length,
    new: contacts.filter((c) => c.status === 'new').length,
    followUp: contacts.filter((c) => c.status === 'follow_up').length,
    interested: contacts.filter((c) => c.status === 'interested').length,
    converted: contacts.filter((c) => c.status === 'converted').length,
  }), [contacts]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  async function bulkUpdateStatus(newStatus: string) {
    setBulkUpdating(true);
    const ids = Array.from(selected);
    let success = 0;

    for (const id of ids) {
      try {
        const res = await fetch('/api/admin/outreach', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: newStatus, lastContactedAt: new Date().toISOString() }),
        });
        if (res.ok) {
          success++;
          setContacts((prev) =>
            prev.map((c) => c.id === id ? { ...c, status: newStatus as OutreachContact['status'] } : c),
          );
        }
      } catch { /* skip */ }
    }

    toast.success(`Updated ${success} contact${success !== 1 ? 's' : ''} to "${newStatus.replace('_', ' ')}"`);
    setSelected(new Set());
    setBulkUpdating(false);
  }

  function exportCSV() {
    const rows = filtered.map((c) => ({
      'Company Name': c.companyName,
      'Contact Name': c.contactName || '',
      'Title': c.title || '',
      'Email': c.email || '',
      'Phone': c.phone || '',
      'Website': c.website || '',
      'Category': categoryLabels[c.category] || c.category,
      'Status': c.status.replace('_', ' '),
      'Source': c.source || '',
      'Address': c.address || '',
      'City': c.city || '',
      'State': c.state || '',
      'Notes': (c.notes || '').replace(/"/g, '""'),
      'Last Contacted': c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : '',
      'Next Follow-Up': c.nextFollowUpAt ? new Date(c.nextFollowUpAt).toLocaleDateString() : '',
    }));

    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${(r as Record<string, string>)[h]}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mayells-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} contacts`);
  }

  function openEmailDialog() {
    const template = EMAIL_TEMPLATES[0];
    setEmailTemplate(0);
    setEmailSubject(template.subject);
    setEmailBody(template.body);
    setEmailDialogOpen(true);
  }

  function selectTemplate(idx: number) {
    setEmailTemplate(idx);
    setEmailSubject(EMAIL_TEMPLATES[idx].subject);
    setEmailBody(EMAIL_TEMPLATES[idx].body);
  }

  async function sendBulkEmail() {
    const ids = Array.from(selected);
    const recipients = contacts.filter((c) => ids.includes(c.id) && c.email);

    if (recipients.length === 0) {
      toast.error('No selected contacts have email addresses');
      return;
    }

    let sent = 0;
    for (const contact of recipients) {
      const personalizedBody = emailBody
        .replace(/{contactName}/g, contact.contactName || 'there')
        .replace(/{companyName}/g, contact.companyName);

      try {
        const res = await fetch('/api/admin/outreach/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contact.email,
            subject: emailSubject.replace(/{companyName}/g, contact.companyName),
            body: personalizedBody,
            contactId: contact.id,
          }),
        });
        if (res.ok) sent++;
      } catch { /* skip */ }
    }

    toast.success(`Sent ${sent} email${sent !== 1 ? 's' : ''}`);
    setEmailDialogOpen(false);
    setSelected(new Set());
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Outreach</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Link href="/admin/outreach/new">
            <Button className="gap-2" size="sm"><Plus className="h-4 w-4" /> Add Contact</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'New', value: stats.new, color: 'text-blue-600' },
          { label: 'Follow Up', value: stats.followUp, color: 'text-orange-600' },
          { label: 'Interested', value: stats.interested, color: 'text-green-600' },
          { label: 'Converted', value: stats.converted, color: 'text-emerald-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(categoryLabels).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} contacts</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-muted border rounded-lg px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-border" />
          <Select onValueChange={bulkUpdateStatus} disabled={bulkUpdating}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Set status..." />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openEmailDialog}>
                <Mail className="h-3.5 w-3.5" /> Send Email
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Send Email to {selected.size} Contact{selected.size !== 1 ? 's' : ''}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs">Template</Label>
                  <div className="flex gap-2 mt-1">
                    {EMAIL_TEMPLATES.map((t, i) => (
                      <Button
                        key={i}
                        variant={emailTemplate === i ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => selectTemplate(i)}
                      >
                        {t.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body <span className="text-muted-foreground">(use {'{contactName}'} and {'{companyName}'} for personalization)</span></Label>
                  <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={12} className="font-mono text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
                  <Button onClick={sendBulkEmail} className="gap-1.5">
                    <Mail className="h-4 w-4" /> Send to {selected.size} Contact{selected.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Follow Up</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((contact) => (
              <TableRow key={contact.id} className={selected.has(contact.id) ? 'bg-muted/50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(contact.id)}
                    onCheckedChange={() => toggleSelect(contact.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/outreach/${contact.id}`} className="font-medium hover:underline">
                    {contact.companyName}
                  </Link>
                  {contact.city && contact.state && (
                    <p className="text-xs text-muted-foreground">{contact.city}, {contact.state}</p>
                  )}
                </TableCell>
                <TableCell>
                  {contact.contactName && (
                    <div>
                      <p className="text-sm">{contact.contactName}</p>
                      {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">
                    {categoryLabels[contact.category] || contact.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[contact.status] || ''}>
                    {contact.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contact.phone || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{contact.email || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {contact.nextFollowUpAt
                    ? new Date(contact.nextFollowUpAt).toLocaleDateString()
                    : '—'}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/outreach/${contact.id}`}>
                    <Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {contacts.length === 0 ? 'No outreach contacts yet. Add your first lead.' : 'No contacts match your filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
