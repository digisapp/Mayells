'use client';

import { useState } from 'react';
import {
  Archive, ArchiveRestore, ArrowLeft, Bot, Building2, Forward, MailOpen, PenLine, RefreshCw,
  Reply, ShieldAlert, ShieldCheck, Sparkles, Star, Trash2, User, Users2, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SandboxedEmail } from '@/components/admin/SandboxedEmail';
import { cn } from '@/lib/utils';
import { CategoryBadge, StatusBadge } from './badges';
import { EmailAttachments } from './Attachments';
import { formatFullDate } from './dates';
import { CATEGORY_LABELS, isForwardOf, readError, type EmailDetail, type EmailLinks, type EmailRow } from './types';

interface Props {
  email: EmailRow;
  thread: EmailRow[];
  loading: boolean;
  error: string | null;
  details: Record<string, EmailDetail>;
  detailFailed: Set<string>;
  sending: boolean;
  onBack: () => void;
  onRetry: () => void;
  onReply: (email: EmailRow) => void;
  onForward: (email: EmailRow) => void;
  onToggleStar: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onSetSpam: (id: string, isSpam: boolean) => void;
  onArchive: (email: EmailRow) => void;
  onArchiveThread: () => void;
  onDelete: (id: string) => void;
  onSendAiDraft: (email: EmailRow) => void;
  onEditAiDraft: (email: EmailRow) => void;
  onDrafted: (email: EmailRow, draft: { aiDraftText: string; aiDraftedAt: string }) => void;
}

/** Cross-links to the person/record behind an email. */
function CounterpartyLinks({ links }: { links: EmailLinks | undefined }) {
  if (!links || (!links.userId && !links.prospectId && !links.outreachId)) return null;
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {links.userId && (
        <a href={`/admin/users/${links.userId}`} className="flex items-center gap-1 text-purple-600 transition-colors hover:text-purple-800">
          <User className="h-3 w-3" />
          View client profile
        </a>
      )}
      {links.prospectId && (
        <a href={`/admin/prospects/${links.prospectId}`} className="flex items-center gap-1 text-champagne transition-colors hover:underline">
          <Users2 className="h-3 w-3" />
          Seller prospect
        </a>
      )}
      {links.outreachId && (
        <a href={`/admin/outreach/${links.outreachId}`} className="flex items-center gap-1 text-champagne transition-colors hover:underline">
          <Building2 className="h-3 w-3" />
          Outreach contact
        </a>
      )}
    </div>
  );
}

/** Body of an email: sandboxed HTML, plain text, or the loading/failed states. */
function EmailBody({ detail, failed }: { detail: EmailDetail | undefined; failed: boolean }) {
  if (failed) return <p className="p-4 text-sm text-red-600">Could not load email content.</p>;
  if (!detail) return <div className="h-20 animate-pulse rounded-md bg-muted" />;
  if (detail.bodyHtml) {
    return (
      <div className="overflow-hidden rounded-md bg-muted/30">
        <SandboxedEmail html={detail.bodyHtml} />
      </div>
    );
  }
  if (detail.bodyText) {
    return <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-4 font-sans text-sm">{detail.bodyText}</pre>;
  }
  return <p className="p-4 text-sm italic text-muted-foreground">(no content)</p>;
}

/**
 * Regenerate the AI draft for an inbound email, or steer it with a short
 * instruction. Stores the draft only — sending stays a separate decision.
 */
function AiDraftControls({
  email, hasDraft, onDrafted, children,
}: {
  email: EmailRow;
  hasDraft: boolean;
  onDrafted: (draft: { aiDraftText: string; aiDraftedAt: string }) => void;
  children?: React.ReactNode;
}) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate(withInstructions: boolean) {
    const trimmed = instructions.trim();
    if (withInstructions && !trimmed) {
      toast.error('Add a short instruction first');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/emails/${email.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withInstructions ? { instructions: trimmed } : {}),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to generate draft'));
      const d = await res.json();
      onDrafted({ aiDraftText: d.data.aiDraftText, aiDraftedAt: d.data.aiDraftedAt });
      toast.success(hasDraft ? 'Draft regenerated' : 'Draft ready');
      setInstructionsOpen(false);
      setInstructions('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {children}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => generate(false)}>
          <RefreshCw className={cn('h-3.5 w-3.5', busy && !instructionsOpen && 'animate-spin')} />
          {hasDraft ? 'Regenerate' : 'Draft with AI'}
        </Button>
        {!instructionsOpen && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setInstructionsOpen(true)}>
            <Wand2 className="h-3.5 w-3.5" />
            With instructions…
          </Button>
        )}
      </div>
      {instructionsOpen && (
        <div className="space-y-2">
          <Textarea
            placeholder="e.g. Offer a Tuesday afternoon appointment and mention that we cover shipping insurance"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            maxLength={1000}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => generate(true)} className="bg-purple-600 text-white hover:bg-purple-700">
              <Sparkles className="h-3.5 w-3.5" />
              {busy ? 'Drafting…' : 'Generate draft'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setInstructionsOpen(false); setInstructions(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Message({
  msg, detail, failed, isLast, isForward, forwards, onReply, onForward, onDelete,
}: {
  msg: EmailRow;
  detail: EmailDetail | undefined;
  failed: boolean;
  isLast: boolean;
  isForward: boolean;
  forwards: EmailRow[];
  onReply: (email: EmailRow) => void;
  onForward: (email: EmailRow) => void;
  onDelete: (id: string) => void;
}) {
  const outbound = msg.direction === 'outbound';
  return (
    <article className={cn('px-4 py-4 sm:px-5', !isLast && 'border-b border-border/60', outbound && 'bg-champagne/5')}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm',
            outbound ? 'bg-charcoal text-champagne' : 'bg-champagne/30 text-charcoal',
          )}>
            {outbound ? 'M' : (msg.fromName || msg.fromEmail)[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold">{outbound ? 'Mayells' : msg.fromName || msg.fromEmail}</span>
              {!outbound && msg.fromName && <span className="truncate text-xs text-muted-foreground">{msg.fromEmail}</span>}
              {isForward && (
                <Badge variant="outline" className="gap-1 text-[11px]"><Forward className="h-2.5 w-2.5" />Forwarded</Badge>
              )}
              {outbound && <StatusBadge status={msg.status} />}
              {msg.aiAutoSent && outbound && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1 text-[11px]"><Bot className="h-2.5 w-2.5" />AI</Badge>
              )}
              {msg.archivedAt && (
                <Badge variant="outline" className="gap-1 text-[11px]"><Archive className="h-2.5 w-2.5" />Archived</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">To: {msg.toName ? `${msg.toName} <${msg.toEmail}>` : msg.toEmail}</p>
            <CounterpartyLinks links={detail?.links} />
          </div>
        </div>
        <time dateTime={msg.createdAt} className="shrink-0 text-xs text-muted-foreground">{formatFullDate(msg.createdAt)}</time>
      </header>

      <EmailBody detail={detail} failed={failed} />
      {!outbound && msg.hasAttachments && <EmailAttachments emailId={msg.id} />}
      {forwards.map((f) => (
        <p key={f.id} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Forward className="h-3 w-3" />
          Forwarded to {f.toEmail} on {formatFullDate(f.createdAt)}
        </p>
      ))}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!outbound && (
          <Button size="xs" variant="ghost" onClick={() => onReply(msg)}><Reply className="h-3 w-3" /> Reply</Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => onForward(msg)}><Forward className="h-3 w-3" /> Forward</Button>
        <Button size="xs" variant="ghost" className="ml-auto text-red-600 hover:text-red-700" onClick={() => onDelete(msg.id)}>
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    </article>
  );
}

export function EmailDetailView({
  email, thread, loading, error, details, detailFailed, sending,
  onBack, onRetry, onReply, onForward, onToggleStar, onMarkUnread, onSetSpam, onArchive, onArchiveThread, onDelete,
  onSendAiDraft, onEditAiDraft, onDrafted,
}: Props) {
  const messages = thread.length > 0 ? thread : [email];
  const inbound = email.direction === 'inbound';
  const detail = details[email.id];
  const hasDraft = !!detail?.aiDraftText;
  const canUseDraft = inbound && hasDraft && !email.aiAutoSent && email.status !== 'replied';
  const canOfferDraft = inbound && detail && !hasDraft && !email.aiAutoSent && email.status !== 'replied';

  // Forwards hang off the message they forwarded (inReplyToId) but are not
  // replies — group them so each original can say where it went.
  const byId = new Map(messages.map((m) => [m.id, m]));
  const forwardsByParent = new Map<string, EmailRow[]>();
  for (const m of messages) {
    if (m.inReplyToId && isForwardOf(m, byId.get(m.inReplyToId))) {
      forwardsByParent.set(m.inReplyToId, [...(forwardsByParent.get(m.inReplyToId) ?? []), m]);
    }
  }

  return (
    // min-w-0: as a flex item this would otherwise be at least as wide as the
    // unwrapped subject line, pushing the whole pane off the right edge.
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5 sm:px-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Back to list">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base">{email.subject || '(no subject)'}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {inbound && <StatusBadge status={email.status} />}
            {email.aiCategory && <CategoryBadge category={email.aiCategory} confidence={email.aiConfidence} />}
            {email.isSpam && <Badge variant="secondary" className="bg-red-100 text-red-800">Spam</Badge>}
            {messages.length > 1 && <span className="text-xs text-muted-foreground">{messages.length} messages</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => onToggleStar(email.id)} aria-label={email.isStarred ? 'Unstar' : 'Star'} aria-pressed={email.isStarred} title="Star (s)">
            <Star className={cn('h-4 w-4', email.isStarred && 'fill-amber-400 text-amber-400')} />
          </Button>
          {inbound && (
            <Button size="icon-sm" variant="ghost" onClick={() => onMarkUnread(email.id)} aria-label="Mark as unread" title="Mark as unread">
              <MailOpen className="h-4 w-4" />
            </Button>
          )}
          {inbound && (
            <Button size="icon-sm" variant="ghost" onClick={() => onSetSpam(email.id, !email.isSpam)} aria-label={email.isSpam ? 'Not spam' : 'Mark as spam'} title={email.isSpam ? 'Not spam' : 'Mark as spam'}>
              {email.isSpam ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => onArchive(email)} aria-label={email.archivedAt ? 'Unarchive' : 'Archive'} title={email.archivedAt ? 'Unarchive' : 'Archive (e)'}>
            {email.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button size="icon-sm" variant="ghost" className="hover:text-red-600" onClick={() => onDelete(email.id)} aria-label="Delete" title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && thread.length === 0 ? (
        <div className="p-4">
          <p className="mb-2 text-sm text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* AI summary + draft */}
          {inbound && (email.aiSummary || canUseDraft || canOfferDraft || email.aiAutoSent) && (
            <div className="space-y-3 border-b border-border/60 bg-muted/30 px-4 py-3 sm:px-5">
              {email.aiSummary && (
                <div className="flex items-start gap-2 text-sm">
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                  <p><span className="font-semibold">Summary.</span> {email.aiSummary}</p>
                </div>
              )}
              {email.aiAutoSent && (
                <p className="flex items-center gap-2 text-xs text-purple-700">
                  <Bot className="h-3.5 w-3.5" />
                  The AI replied to this email automatically{email.aiCategory ? ` (${CATEGORY_LABELS[email.aiCategory] || email.aiCategory})` : ''} — the reply is in the conversation below.
                </p>
              )}
              {canUseDraft && detail && (
                <div className="rounded-lg border border-purple-200 bg-background p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-700">
                      <Bot className="h-3.5 w-3.5" /> Suggested reply
                      {detail.aiDraftedAt && <span className="font-normal normal-case tracking-normal text-purple-400">· {formatFullDate(detail.aiDraftedAt)}</span>}
                    </span>
                  </div>
                  <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">{detail.aiDraftText}</p>
                  <AiDraftControls email={email} hasDraft onDrafted={(d) => onDrafted(email, d)}>
                    <Button size="sm" onClick={() => onSendAiDraft(email)} disabled={sending} className="bg-purple-600 text-white hover:bg-purple-700">
                      <Sparkles className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send as is'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEditAiDraft(email)} disabled={sending}>
                      <PenLine className="h-3.5 w-3.5" /> Edit & send
                    </Button>
                  </AiDraftControls>
                </div>
              )}
              {canOfferDraft && (
                <div className="rounded-lg border border-dashed border-purple-200 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-purple-700">
                    <Bot className="h-3.5 w-3.5" />
                    No AI draft for this email yet.
                  </p>
                  <AiDraftControls email={email} hasDraft={false} onDrafted={(d) => onDrafted(email, d)} />
                </div>
              )}
            </div>
          )}

          {loading && thread.length === 0 ? (
            <div className="space-y-3 p-4">
              {[1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : (
            messages.map((msg, i) => (
              <Message
                key={msg.id}
                msg={msg}
                detail={details[msg.id]}
                failed={detailFailed.has(msg.id)}
                isLast={i === messages.length - 1}
                isForward={isForwardOf(msg, msg.inReplyToId ? byId.get(msg.inReplyToId) : undefined)}
                forwards={forwardsByParent.get(msg.id) ?? []}
                onReply={onReply}
                onForward={onForward}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
        {inbound ? (
          <Button variant="champagne" onClick={() => onReply(email)} title="Reply (r)">
            <Reply className="h-4 w-4" /> Reply
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onForward(email)} title="Forward (f)">
            <Forward className="h-4 w-4" /> Forward
          </Button>
        )}
        {inbound && (
          <Button variant="outline" onClick={() => onForward(email)} title="Forward (f)">
            <Forward className="h-4 w-4" /> Forward
          </Button>
        )}
        {messages.length > 1 && (
          <Button variant="ghost" className="ml-auto" onClick={onArchiveThread}>
            <Archive className="h-4 w-4" /> Archive conversation
          </Button>
        )}
      </div>
    </div>
  );
}
