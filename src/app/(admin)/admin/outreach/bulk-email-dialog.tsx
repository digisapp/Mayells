'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mail, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachContact } from '@/db/schema/outreach';
import { EMAIL_TEMPLATES, OUTREACH_NO_EMAIL_STATUSES, personalizeTemplate } from '@/lib/config/outreach';
import { readFailure } from './form-utils';

interface BulkEmailDialogProps {
  contacts: OutreachContact[];
  selectedIds: Set<string>;
  onComplete: (updatedContacts: OutreachContact[]) => void;
}

export function BulkEmailDialog({ contacts, selectedIds, onComplete }: BulkEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(EMAIL_TEMPLATES[0].body);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedCount = selectedIds.size;

  // Worked out up front so the operator sees who will be skipped BEFORE sending
  const { recipients, skippedNoEmail, skippedOptOut } = useMemo(() => {
    const chosen = contacts.filter((c) => selectedIds.has(c.id));
    const recipients = chosen.filter((c) => c.email && !OUTREACH_NO_EMAIL_STATUSES.includes(c.status));
    const skippedOptOut = chosen.filter((c) => OUTREACH_NO_EMAIL_STATUSES.includes(c.status)).length;
    const skippedNoEmail = chosen.length - recipients.length - skippedOptOut;
    return { recipients, skippedNoEmail, skippedOptOut };
  }, [contacts, selectedIds]);
  const skipped = skippedNoEmail + skippedOptOut;

  function handleOpen() {
    const template = EMAIL_TEMPLATES[0];
    setTemplateIndex(0);
    setSubject(template.subject);
    setBody(template.body);
    setProgress(0);
    setOpen(true);
  }

  function selectTemplate(idx: number) {
    setTemplateIndex(idx);
    setSubject(EMAIL_TEMPLATES[idx].subject);
    setBody(EMAIL_TEMPLATES[idx].body);
  }

  async function sendBulkEmail() {
    if (recipients.length === 0) {
      toast.error('No selected contacts are emailable (missing email or opted out)');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }

    setSending(true);
    setProgress(0);
    let sent = 0;
    const failures: string[] = [];
    const updatedContacts: OutreachContact[] = [];

    for (const contact of recipients) {
      try {
        const res = await fetch('/api/admin/outreach/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: contact.id,
            subject: personalizeTemplate(subject, contact),
            body: personalizeTemplate(body, contact),
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          sent++;
          if (data.data) updatedContacts.push(data.data as OutreachContact);
        } else {
          failures.push(`${contact.companyName}: ${(await readFailure(res, 'send failed')).error}`);
        }
      } catch {
        failures.push(`${contact.companyName}: network error`);
      }
      setProgress(sent + failures.length);
    }

    if (sent > 0) {
      toast.success(
        `Sent ${sent} email${sent !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped — no email or opted out)` : ''}`,
      );
    }
    if (failures.length > 0) {
      toast.error(`Failed to send ${failures.length} email${failures.length !== 1 ? 's' : ''}`, {
        description: failures.slice(0, 3).join('\n') + (failures.length > 3 ? `\n…and ${failures.length - 3} more` : ''),
        duration: 10_000,
      });
    }
    setSending(false);
    setOpen(false);
    onComplete(updatedContacts);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpen}>
          <Mail className="h-3.5 w-3.5" /> Send Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" showCloseButton={!sending}>
        <DialogHeader>
          <DialogTitle>Send Email to {selectedCount} Contact{selectedCount !== 1 ? 's' : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {skipped > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>{skipped}</strong> of {selectedCount} will be skipped
                {skippedNoEmail > 0 && ` — ${skippedNoEmail} without an email address`}
                {skippedNoEmail > 0 && skippedOptOut > 0 && ','}
                {skippedOptOut > 0 && ` ${skippedOptOut} marked not interested / do not contact`}.
                {' '}{recipients.length} will receive this email.
              </span>
            </div>
          )}
          <div>
            <Label className="text-xs">Template</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EMAIL_TEMPLATES.map((t, i) => (
                <Button
                  key={i}
                  variant={templateIndex === i ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => selectTemplate(i)}
                  disabled={sending}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Body <span className="text-muted-foreground">(use {'{contactName}'} and {'{companyName}'} — a missing name becomes &ldquo;Dear Colleague&rdquo;)</span>
            </Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-sm" disabled={sending} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {sending && (
              <span className="text-xs text-muted-foreground mr-auto inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending {Math.min(progress + 1, recipients.length)} of {recipients.length}…
              </span>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={sendBulkEmail} className="gap-1.5" disabled={sending || recipients.length === 0}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sending ? `Sending ${progress} of ${recipients.length}` : `Send to ${recipients.length} Contact${recipients.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
