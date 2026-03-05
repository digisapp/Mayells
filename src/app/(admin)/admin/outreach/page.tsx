export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { outreachContacts } from '@/db/schema';
import { desc, asc, sql } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil } from 'lucide-react';

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

export default async function AdminOutreachPage() {
  const contacts = await db
    .select()
    .from(outreachContacts)
    .orderBy(asc(outreachContacts.nextFollowUpAt), desc(outreachContacts.createdAt))
    .limit(500);

  const stats = {
    total: contacts.length,
    new: contacts.filter((c) => c.status === 'new').length,
    followUp: contacts.filter((c) => c.status === 'follow_up').length,
    interested: contacts.filter((c) => c.status === 'interested').length,
    converted: contacts.filter((c) => c.status === 'converted').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Outreach</h1>
        <Link href="/admin/outreach/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> Add Contact</Button>
        </Link>
      </div>

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

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
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
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
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
            {contacts.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No outreach contacts yet. Add your first lead.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
