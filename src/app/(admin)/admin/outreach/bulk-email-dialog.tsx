'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachContact } from '@/db/schema/outreach';
import { EMAIL_TEMPLATES } from '@/lib/config/outreach';

interface BulkEmailDialogProps {
  selectedCount: number;
  contacts: OutreachContact[];
  selectedIds: Set<string>;
  onComplete: () => void;
}

export function BulkEmailDialog({ selectedCount, contacts, selectedIds, onComplete }: BulkEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(EMAIL_TEMPLATES[0].body);

  function handleOpen() {
    const template = EMAIL_TEMPLATES[0];
    setTemplateIndex(0);
    setSubject(template.subject);
    setBody(template.body);
    setOpen(true);
  }

  function selectTemplate(idx: number) {
    setTemplateIndex(idx);
    setSubject(EMAIL_TEMPLATES[idx].subject);
    setBody(EMAIL_TEMPLATES[idx].body);
  }

  async function sendBulkEmail() {
    const ids = Array.from(selectedIds);
    const recipients = contacts.filter((c) => ids.includes(c.id) && c.email);

    if (recipients.length === 0) {
      toast.error('No selected contacts have email addresses');
      return;
    }

    let sent = 0;
    for (const contact of recipients) {
      const personalizedBody = body
        .replace(/{contactName}/g, contact.contactName || 'there')
        .replace(/{companyName}/g, contact.companyName);

      try {
        const res = await fetch('/api/admin/outreach/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: contact.email,
            subject: subject.replace(/{companyName}/g, contact.companyName),
            body: personalizedBody,
            contactId: contact.id,
          }),
        });
        if (res.ok) sent++;
      } catch { /* skip */ }
    }

    toast.success(`Sent ${sent} email${sent !== 1 ? 's' : ''}`);
    setOpen(false);
    onComplete();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpen}>
          <Mail className="h-3.5 w-3.5" /> Send Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Email to {selectedCount} Contact{selectedCount !== 1 ? 's' : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Template</Label>
            <div className="flex gap-2 mt-1">
              {EMAIL_TEMPLATES.map((t, i) => (
                <Button
                  key={i}
                  variant={templateIndex === i ? 'default' : 'outline'}
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
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Body <span className="text-muted-foreground">(use {'{contactName}'} and {'{companyName}'} for personalization)</span></Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={sendBulkEmail} className="gap-1.5">
              <Mail className="h-4 w-4" /> Send to {selectedCount} Contact{selectedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
