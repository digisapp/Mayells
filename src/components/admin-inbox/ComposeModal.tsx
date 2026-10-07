'use client';

import { useCallback } from 'react';
import { ChevronDown, FileText, Forward, Paperclip, PenLine, Send, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EMAIL_TEMPLATES } from '@/lib/config/outreach';
import type { ComposeState } from '@/hooks/useAdminInbox';
import { AttachmentChips, readFilesInto } from './Attachments';
import { appendSignature, fillTemplate, type OutgoingAttachment } from './types';

interface Props {
  compose: ComposeState;
  from: string;
  sending: boolean;
  onField: <K extends keyof ComposeState>(field: K, value: ComposeState[K]) => void;
  onSend: () => void;
  onClose: () => void;
  onDiscard: () => void;
}

const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

/** Template picker + signature insert, shared by compose and reply. */
function TemplateMenu({
  contactName, onPickTemplate, onInsertSignature,
}: {
  contactName?: string | null;
  onPickTemplate: (t: { subject: string; body: string }) => void;
  onInsertSignature: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" type="button">
          <FileText className="h-3.5 w-3.5" />
          Templates
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs">Insert template</DropdownMenuLabel>
        {EMAIL_TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.name} onSelect={() => onPickTemplate({ subject: t.subject, body: fillTemplate(t.body, contactName) })}>
            {t.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onInsertSignature}>
          <PenLine className="h-3.5 w-3.5" />
          Insert signature
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ComposeModal({ compose, from, sending, onField, onSend, onClose, onDiscard }: Props) {
  const isReply = compose.mode === 'reply';
  const isForward = compose.mode === 'forward';
  const canSend = !!(compose.to.trim() && compose.subject.trim() && compose.body.trim()) && !sending;
  const contactName = compose.replyTo?.fromName ?? null;
  const original = compose.replyTo ?? compose.forwardOf;
  const setAttachments: React.Dispatch<React.SetStateAction<OutgoingAttachment[]>> = (next) =>
    onField('attachments', typeof next === 'function' ? next(compose.attachments) : next);

  // A reply opens greeted and signed; the caret lands between the two, so
  // typing starts where the operator's words go. A ref callback, not an
  // effect: the dialog's portal mounts a render later than the open flag,
  // so an effect keyed on it finds no textarea yet. The callback runs when
  // the textarea exists (and again per reply, as caretAt changes).
  const caretAt = compose.caretAt;
  const bodyRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el || caretAt === undefined) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretAt, caretAt);
    });
  }, [caretAt]);

  return (
    <Dialog open={compose.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!sending}>
        <DialogHeader>
          <DialogTitle>{isReply ? 'Reply' : isForward ? 'Forward email' : 'New email'}</DialogTitle>
          <DialogDescription>
            From <span className="font-medium text-foreground">{from}</span>. Replies to it come back to this inbox.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }}
        >
          {isForward && compose.forwardOf && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Forward className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                Forwarding <strong className="text-foreground">{compose.forwardOf.subject || '(no subject)'}</strong>
                {' '}from {compose.forwardOf.fromName || compose.forwardOf.fromEmail}
              </span>
              {compose.forwardOf.direction === 'inbound' && compose.forwardOf.hasAttachments && (
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={compose.includeOriginalAttachments}
                    onChange={(e) => onField('includeOriginalAttachments', e.target.checked)}
                    className="accent-champagne"
                  />
                  Include original attachments
                </label>
              )}
            </div>
          )}

          <div>
            <label htmlFor="compose-to" className="mb-1 block text-xs font-medium">To</label>
            <input
              id="compose-to"
              type="email"
              autoComplete="off"
              value={compose.to}
              onChange={(e) => onField('to', e.target.value)}
              placeholder="name@example.com"
              readOnly={isReply}
              autoFocus={isForward}
              className={`${inputCls} ${isReply ? 'bg-muted/40 text-muted-foreground' : ''}`}
            />
          </div>

          <div>
            <label htmlFor="compose-subject" className="mb-1 block text-xs font-medium">Subject</label>
            <input
              id="compose-subject"
              type="text"
              value={compose.subject}
              onChange={(e) => onField('subject', e.target.value)}
              placeholder="Subject"
              maxLength={500}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="compose-body" className="mb-1 block text-xs font-medium">Message</label>
            <Textarea
              id="compose-body"
              ref={bodyRef}
              value={compose.body}
              onChange={(e) => onField('body', e.target.value)}
              placeholder="Write your message…"
              rows={isForward ? 12 : 9}
              autoFocus={isReply || !isForward}
              className="min-h-[160px] resize-y leading-relaxed"
            />
          </div>

          {isReply && original && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={compose.quoteOriginal}
                onChange={(e) => onField('quoteOriginal', e.target.checked)}
                className="accent-champagne"
              />
              Quote {original.fromName || original.fromEmail}&apos;s message under the reply
            </label>
          )}

          <AttachmentChips items={compose.attachments} onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" variant="champagne" disabled={!canSend}>
              {isForward ? <Forward className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : isForward ? 'Forward' : 'Send'}
            </Button>
            <TemplateMenu
              contactName={contactName}
              onPickTemplate={(t) => {
                if (!isReply && !compose.subject.trim()) onField('subject', t.subject);
                onField('body', t.body);
              }}
              onInsertSignature={() => onField('body', appendSignature(compose.body))}
            />
            <label className="cursor-pointer">
              <input type="file" multiple className="hidden" onChange={(e) => readFilesInto(e, compose.attachments, setAttachments)} />
              <Button size="sm" variant="outline" type="button" asChild>
                <span><Paperclip className="h-3.5 w-3.5" /> Attach</span>
              </Button>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-red-600">
                <X className="h-4 w-4" /> Discard
              </button>
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={sending}>
                {isForward ? 'Cancel' : 'Close'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
