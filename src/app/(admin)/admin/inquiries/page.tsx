'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

interface InquiryRow {
  inquiry: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    message: string | null;
    status: string;
    adminNotes: string | null;
    createdAt: string;
  };
  lot: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  };
}

const statusBadge: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-champagne/20 text-champagne',
  closed: 'bg-gray-100 text-gray-800',
};

export default function AdminInquiriesPage() {
  const [items, setItems] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    fetch('/api/admin/inquiries')
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []))
      .catch(() => toast.error('Failed to load inquiries'))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpdate(id: string) {
    try {
      const res = await fetch('/api/admin/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: editStatus || undefined, adminNotes: editNotes }),
      });

      if (res.ok) {
        toast.success('Inquiry updated');
        setEditingId(null);
        setEditStatus('');
        setEditNotes('');
        const refreshRes = await fetch('/api/admin/inquiries');
        const data = await refreshRes.json();
        setItems(data.data ?? []);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Network error');
    }
  }

  const newCount = items.filter((i) => i.inquiry.status === 'new').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Private Sale Inquiries</h1>
          {newCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{newCount} new {newCount === 1 ? 'inquiry' : 'inquiries'} awaiting response</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No inquiries yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <Card key={row.inquiry.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {row.lot.primaryImageUrl && (
                      <img
                        src={row.lot.primaryImageUrl}
                        alt={row.lot.title}
                        className="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <div>
                      <CardTitle className="text-base">{row.lot.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        From <strong>{row.inquiry.name}</strong>
                      </p>
                    </div>
                  </div>
                  <Badge className={statusBadge[row.inquiry.status] ?? ''} variant="secondary">
                    {row.inquiry.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <a href={`mailto:${row.inquiry.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {row.inquiry.email}
                  </a>
                  {row.inquiry.phone && (
                    <a href={`tel:${row.inquiry.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Phone className="h-3.5 w-3.5" />
                      {row.inquiry.phone}
                    </a>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(row.inquiry.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {row.inquiry.message && (
                  <p className="text-sm bg-muted/50 p-3 rounded-md">{row.inquiry.message}</p>
                )}

                {row.inquiry.adminNotes && (
                  <p className="text-sm italic text-muted-foreground">Notes: &ldquo;{row.inquiry.adminNotes}&rdquo;</p>
                )}

                {editingId === row.inquiry.id ? (
                  <div className="space-y-3 border-t pt-3">
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Update status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Internal notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(row.inquiry.id)}
                        className="bg-champagne text-charcoal hover:bg-champagne/90"
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(row.inquiry.id);
                      setEditStatus(row.inquiry.status);
                      setEditNotes(row.inquiry.adminNotes ?? '');
                    }}
                  >
                    Manage
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
