'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SandboxedEmail } from '@/components/admin/SandboxedEmail';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import {
  Inbox, Send, Mail, Reply, Plus, ChevronDown, ChevronUp, Circle,
  Search, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle, Clock,
  ShieldAlert, User, Bot, Sparkles, Trash2, Check, X, ArrowLeft,
  MessageSquare, Paperclip, Download, Archive, ArchiveRestore, MailOpen,
  FileText, PenLine, Keyboard, Users2, Building2, Forward, MoreHorizontal,
  RefreshCw, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { escapeHtml } from '@/lib/email/escape';
import { EMAIL_TEMPLATES } from '@/lib/config/outreach';
import { refreshAdminBadges } from '@/hooks/useAdminBadges';

// ─── Types ───────────────────────────────────────────────────────────────────

// Slim header row returned by the list/thread endpoints — full bodies and AI
// drafts are fetched on demand from /api/admin/emails/[id] when expanded.
interface EmailRow {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  inReplyToId: string | null;
  threadId: string | null;
  userId: string | null;
  aiAutoSent: boolean;
  aiCategory: string | null;
  aiConfidence: number | null;
  aiSummary: string | null;
  aiDraftedAt: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  preview: string;
  hasAttachments: boolean;
  /** Derived from the thread: the other side has replied to this message. */
  hasResponse: boolean;
}

interface EmailLinks {
  userId: string | null;
  prospectId: string | null;
  outreachId: string | null;
}

// Heavy fields of the full email row, fetched per email on expand
interface EmailDetail {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  aiDraftText: string | null;
  aiDraftedAt: string | null;
  links: EmailLinks;
}

interface AttachmentLink {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  downloadUrl: string;
}

interface OutgoingAttachment {
  content: string;
  filename: string;
  contentType: string;
  size: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type Tab = 'inbox' | 'sent' | 'spam';
type Filter = 'all' | 'unread' | 'needs_review' | 'archived';

// ─── Constants ───────────────────────────────────────────────────────────────

const SIGNATURE = 'MAYELLS · Palm Beach · info@mayells.com';

// Vercel rejects request bodies over 4.5 MB; base64 adds a third, so cap the
// raw attachment bytes well below that.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const statusBadgeStyles: Record<string, { className: string; label: string; icon?: React.ReactNode }> = {
  received: { className: 'bg-blue-100 text-blue-800', label: 'New', icon: <Circle className="h-2.5 w-2.5 fill-blue-500" /> },
  read: { className: 'bg-gray-100 text-gray-800', label: 'Read' },
  replied: { className: 'bg-green-100 text-green-800', label: 'Replied', icon: <Reply className="h-3 w-3" /> },
  sent: { className: 'bg-champagne/20 text-champagne', label: 'Sent', icon: <Clock className="h-3 w-3" /> },
  delivered: { className: 'bg-green-100 text-green-800', label: 'Delivered', icon: <CheckCheck className="h-3 w-3" /> },
  bounced: { className: 'bg-red-100 text-red-800', label: 'Bounced', icon: <AlertTriangle className="h-3 w-3" /> },
};

const categoryLabels: Record<string, string> = {
  appraisal_request: 'Appraisal',
  consignment_inquiry: 'Consignment',
  purchase_inquiry: 'Purchase',
  auction_question: 'Auction',
  estate_evaluation: 'Estate',
  scheduling: 'Scheduling',
  general_inquiry: 'General',
  feedback: 'Feedback',
  partnership: 'Partnership',
  support: 'Support',
  personal: 'Personal',
  spam: 'Spam',
  system: 'System',
  other: 'Other',
};

const filterLabels: Record<Filter, string> = {
  all: 'All',
  unread: 'Unread',
  needs_review: 'Needs review',
  archived: 'Archived',
};

// ─── Small helpers ───────────────────────────────────────────────────────────

/** Extract an error message without assuming the body is JSON (413s, proxy errors…). */
async function readError(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') return data.error;
    } catch { /* fall through */ }
  }
  if (res.status === 413) return 'Message too large — remove some attachments (3 MB limit).';
  return `${fallback} (${res.status})`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isUnread(email: EmailRow): boolean {
  return email.direction === 'inbound' && !email.readAt;
}

function replySubject(subject: string | null): string {
  return `Re: ${(subject || '').replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '')}`;
}

function fillTemplate(body: string, name: string | null | undefined): string {
  return body.replace(/{contactName}/g, name || 'there').replace(/{companyName}/g, '');
}

function appendSignature(body: string): string {
  const trimmed = body.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n\n' : ''}${SIGNATURE}`;
}

function quotedHtml(email: EmailRow, detail: EmailDetail | null | undefined): string {
  if (!detail) return '';
  const quoted = detail.bodyHtml || escapeHtml(detail.bodyText || '').replace(/\n/g, '<br />');
  if (!quoted) return '';
  return `
    <br /><br />
    <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666; font-size: 13px;">
      <p style="margin: 0 0 4px;">On ${new Date(email.createdAt).toLocaleDateString()}, ${escapeHtml(email.fromName || email.fromEmail)} wrote:</p>
      <div>${quoted}</div>
    </div>`;
}

function quotedText(email: EmailRow, detail: EmailDetail | null | undefined): string {
  if (!detail?.bodyText) return '';
  return `\n\n> On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:\n> ${detail.bodyText.split('\n').join('\n> ')}`;
}

/**
 * Plain-text rendering of an HTML body, for quoting in a forward. DOMParser
 * builds an inert document: nothing runs, nothing is fetched.
 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, head, title').forEach((n) => n.remove());
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table').forEach((n) => n.append('\n'));
  return (doc.body?.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function forwardSubject(subject: string | null): string {
  const s = (subject || '').trim();
  return /^fwd?\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

/** Headers block + quoted original, with room above for the operator's note. */
function forwardBody(email: EmailRow, detail: EmailDetail): string {
  const original = detail.bodyText?.trim() || (detail.bodyHtml ? htmlToText(detail.bodyHtml) : '');
  const from = email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail;
  const date = new Date(email.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return [
    '',
    '',
    '---------- Forwarded message ----------',
    `From: ${from}`,
    `Date: ${date}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `To: ${email.toEmail}`,
    '',
    original || '(no message body)',
  ].join('\n');
}

/**
 * An outbound thread member is a forward (not a reply) when it went somewhere
 * other than the counterparty of the message it hangs off. Nothing on the row
 * says so; the "Fwd:" subject is the fallback when the recipient was the same.
 */
function isForwardOf(row: EmailRow, parent: EmailRow | undefined): boolean {
  if (row.direction !== 'outbound' || !row.inReplyToId) return false;
  if (/^\s*fwd?\s*:/i.test(row.subject || '')) return true;
  if (!parent) return false;
  const counterparty = parent.direction === 'inbound' ? parent.fromEmail : parent.toEmail;
  return counterparty.toLowerCase() !== row.toEmail.toLowerCase();
}

/** Read files into base64, enforcing the total-size cap across the set. */
function readFilesInto(
  e: React.ChangeEvent<HTMLInputElement>,
  existing: OutgoingAttachment[],
  setter: React.Dispatch<React.SetStateAction<OutgoingAttachment[]>>,
) {
  const files = e.target.files;
  e.target.value = '';
  if (!files) return;
  let total = existing.reduce((sum, a) => sum + a.size, 0);
  for (const file of Array.from(files)) {
    if (total + file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`"${file.name}" would push attachments over the 3 MB limit (${formatBytes(total)} attached).`);
      continue;
    }
    total += file.size;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setter((prev) => [...prev, {
        content: base64,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }]);
    };
    reader.readAsDataURL(file);
  }
}

// ─── Presentational bits ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const style = statusBadgeStyles[status] || { className: 'bg-gray-100 text-gray-800', label: status };
  return (
    <Badge variant="secondary" className={`${style.className} gap-1 text-xs`}>
      {style.icon}
      {style.label}
    </Badge>
  );
}

function CategoryBadge({ category, confidence }: { category: string; confidence: number | null }) {
  const label = categoryLabels[category] || category;
  const confPct = confidence ? Math.round(confidence * 100) : null;
  return (
    <Badge variant="outline" className="gap-1 text-xs border-purple-200 text-purple-700">
      <Bot className="h-2.5 w-2.5" />
      {label}
      {confPct !== null && <span className="text-purple-400">{confPct}%</span>}
    </Badge>
  );
}

function AttachmentChips({
  items, onRemove,
}: { items: OutgoingAttachment[]; onRemove: (index: number) => void }) {
  if (items.length === 0) return null;
  const total = items.reduce((s, a) => s + a.size, 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 text-xs">
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[150px] truncate">{a.filename}</span>
          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${a.filename}`}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <span className="text-[11px] text-muted-foreground">{formatBytes(total)} of 3 MB</span>
    </div>
  );
}

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
          <FileText className="h-3.5 w-3.5 mr-1" />
          Templates
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs">Insert template</DropdownMenuLabel>
        {EMAIL_TEMPLATES.map((t) => (
          <DropdownMenuItem
            key={t.name}
            onSelect={() => onPickTemplate({ subject: t.subject, body: fillTemplate(t.body, contactName) })}
          >
            {t.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onInsertSignature}>
          <PenLine className="h-3.5 w-3.5 mr-1" />
          Insert signature
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Full-screen viewer for image attachments: large view, prev/next, download. */
function AttachmentLightbox({
  images, index, onClose, onNavigate,
}: {
  images: AttachmentLink[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const image = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, hasPrev, hasNext, onClose, onNavigate]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={image.filename}
    >
      <div className="flex items-center justify-between gap-3 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm truncate">
          {image.filename}
          <span className="ml-2 text-xs text-white/60">
            {formatBytes(image.size)}{images.length > 1 ? ` · ${index + 1} of ${images.length}` : ''}
          </span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={image.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
          <button
            onClick={onClose}
            className="rounded-md bg-white/10 hover:bg-white/20 p-1.5 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 flex items-center justify-center min-h-0 p-4">
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
            className="absolute left-3 z-10 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.downloadUrl}
          alt={image.filename}
          className="max-h-full max-w-full object-contain rounded-md"
          onClick={(e) => e.stopPropagation()}
        />
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
            className="absolute right-3 z-10 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Attachments of an inbound email. Files live on Resend behind expiring
 * signed URLs, so this fetches fresh links every time it mounts.
 */
function EmailAttachments({ emailId }: { emailId: string }) {
  const [items, setItems] = useState<AttachmentLink[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/emails/${emailId}/attachments`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setItems(d.data ?? []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [emailId]);

  if (failed) {
    return <p className="text-xs text-red-600 mt-3">Could not load attachments.</p>;
  }
  if (items === null) {
    return (
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <Paperclip className="h-3 w-3 animate-pulse" />
        Loading attachments…
      </div>
    );
  }
  if (items.length === 0) return null;

  const images = items.filter((a) => a.contentType.startsWith('image/'));
  const files = items.filter((a) => !a.contentType.startsWith('image/'));

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        {items.length} attachment{items.length > 1 ? 's' : ''}
      </p>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
              className="block group relative cursor-zoom-in"
              title={`${a.filename} (${formatBytes(a.size)}) — click to view`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.downloadUrl}
                alt={a.filename}
                className="h-28 w-28 object-cover rounded-md border border-border group-hover:opacity-90 transition-opacity"
              />
              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-b-md truncate">
                {a.filename}
              </span>
            </button>
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <AttachmentLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-champagne hover:underline w-fit"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {a.filename}
          <span className="text-xs text-muted-foreground">({formatBytes(a.size)})</span>
        </a>
      ))}
    </div>
  );
}

function QuotedOriginal({ email, detail }: { email: EmailRow; detail: EmailDetail | null | undefined }) {
  const text = detail?.bodyText || '';
  if (!text) return null;
  const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
  return (
    <div className="mt-3 border-l-2 border-muted pl-3 text-xs text-muted-foreground">
      <p className="font-medium mb-1">
        On {new Date(email.createdAt).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        })}, {email.fromName || email.fromEmail} wrote:
      </p>
      <p className="whitespace-pre-wrap">{preview}</p>
    </div>
  );
}

/** Body of an email: sandboxed HTML, plain text, or the loading/failed states. */
function EmailBody({ detail, failed, compact }: { detail: EmailDetail | undefined; failed: boolean; compact?: boolean }) {
  if (failed) return <p className="text-sm text-red-600 p-4">Could not load email content.</p>;
  if (!detail) return <div className={`${compact ? 'h-16' : 'h-24'} bg-muted animate-pulse rounded-md`} />;
  if (detail.bodyHtml) {
    return (
      <div className="bg-muted/30 rounded-md overflow-hidden">
        <SandboxedEmail html={detail.bodyHtml} />
      </div>
    );
  }
  if (detail.bodyText) {
    return <pre className="text-sm bg-muted/30 rounded-md p-4 whitespace-pre-wrap overflow-auto max-h-96">{detail.bodyText}</pre>;
  }
  return <p className="text-sm text-muted-foreground italic p-4">(no content)</p>;
}

/** Cross-links to the person/record behind an email. */
function CounterpartyLinks({ links }: { links: EmailLinks | undefined }) {
  if (!links) return null;
  return (
    <>
      {links.userId && (
        <a href={`/admin/users/${links.userId}`} className="flex items-center gap-1 text-purple-600 hover:text-purple-800 transition-colors">
          <User className="h-3 w-3" />
          View user profile
        </a>
      )}
      {links.prospectId && (
        <a href={`/admin/prospects/${links.prospectId}`} className="flex items-center gap-1 text-champagne hover:underline transition-colors">
          <Users2 className="h-3 w-3" />
          Seller prospect
        </a>
      )}
      {links.outreachId && (
        <a href={`/admin/outreach/${links.outreachId}`} className="flex items-center gap-1 text-champagne hover:underline transition-colors">
          <Building2 className="h-3 w-3" />
          Outreach contact
        </a>
      )}
    </>
  );
}

// ─── Reply composer (list + thread) ──────────────────────────────────────────

function ReplyComposer({
  email, detail, initialBody, onSent, onCancel,
}: {
  email: EmailRow;
  detail: EmailDetail | null | undefined;
  initialBody?: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody ?? '');
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) {
      toast.error('Write a reply first');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: replySubject(email.subject),
          html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(body).replace(/\n/g, '<br />')}${quotedHtml(email, detail)}</div>`,
          text: `${body}${quotedText(email, detail)}`,
          inReplyToId: email.id,
          ...(attachments.length > 0 && {
            attachments: attachments.map(({ content, filename, contentType }) => ({ content, filename, contentType })),
          }),
        }),
      });
      if (res.ok) {
        toast.success(`Reply sent to ${email.fromEmail}`);
        onSent();
      } else {
        toast.error(await readError(res, 'Failed to send reply'));
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="w-full space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Replying to {email.fromName || email.fromEmail}
        {!detail && <span className="ml-1">(original message could not be loaded — it will not be quoted)</span>}
      </p>
      <Textarea
        placeholder="Write your reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        autoFocus
      />
      <QuotedOriginal email={email} detail={detail} />
      <AttachmentChips items={attachments} onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={send}
          disabled={sending}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          <Send className="h-3.5 w-3.5 mr-2" />
          {sending ? 'Sending...' : 'Send Reply'}
        </Button>
        <TemplateMenu
          contactName={email.fromName}
          onPickTemplate={(t) => setBody(t.body)}
          onInsertSignature={() => setBody((b) => appendSignature(b))}
        />
        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={(e) => readFilesInto(e, attachments, setAttachments)} />
          <Button size="sm" variant="outline" type="button" asChild>
            <span>
              <Paperclip className="h-3.5 w-3.5 mr-1" />
              Attach
            </span>
          </Button>
        </label>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── AI draft controls ───────────────────────────────────────────────────────

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
  /** Leading buttons rendered in the same row (Send / Edit when a draft exists). */
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
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy && !instructionsOpen ? 'animate-spin' : ''}`} />
          {hasDraft ? 'Regenerate draft' : 'Draft with AI'}
        </Button>
        {!instructionsOpen && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setInstructionsOpen(true)}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Draft with instructions…
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
            <Button
              size="sm"
              disabled={busy}
              onClick={() => generate(true)}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
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

// ─── Page ────────────────────────────────────────────────────────────────────

function AdminEmailsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>('inbox');
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [emailList, setEmailList] = useState<EmailRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 30, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emailDetails, setEmailDetails] = useState<Record<string, EmailDetail>>({});
  const [detailFailedIds, setDetailFailedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replySeed, setReplySeed] = useState<string>('');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);

  // Compose state
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  // Forward mode: the compose form is prefilled from this email and sent via
  // its /forward endpoint so the original attachments ride along.
  const [forwardOf, setForwardOf] = useState<EmailRow | null>(null);
  const [includeOriginalAttachments, setIncludeOriginalAttachments] = useState(true);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Thread view
  const [threadView, setThreadView] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<EmailRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page) });
    if (tab === 'spam') {
      params.set('direction', 'inbound');
      params.set('spam', 'true');
    } else {
      params.set('direction', tab === 'inbox' ? 'inbound' : 'outbound');
      params.set('spam', 'false');
    }
    if (filter !== 'all') params.set('filter', filter);
    if (category) params.set('category', category);
    if (searchQuery) params.set('search', searchQuery);

    return fetch(`/api/admin/emails?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r, 'Failed to load emails'));
        return r.json();
      })
      .then((d) => {
        setLoadError(null);
        setEmailList(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
        if (typeof d.unread === 'number') setUnreadTotal(d.unread);
        if (Array.isArray(d.categories)) setCategories(d.categories);
      })
      .catch((err: Error) => {
        // Shown inline with a Retry button — the list itself is the surface.
        setLoadError(err.message || 'Failed to load emails');
      })
      .finally(() => setLoading(false));
  }, [tab, filter, category, searchQuery, pagination.page]);

  // Fetch the heavy fields (bodies, AI draft, cross-links) of one email, cached
  // by id. Resolves with the detail (or null on failure) so actions that need
  // the body right away — forwarding — can await it.
  const detailsRef = useRef(emailDetails);
  detailsRef.current = emailDetails;
  const loadEmailDetail = useCallback(async (id: string): Promise<EmailDetail | null> => {
    setDetailFailedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const r = await fetch(`/api/admin/emails/${id}`);
      if (!r.ok) throw new Error(await readError(r, 'Failed to load email'));
      const d = await r.json();
      const detail: EmailDetail = { ...d.data, links: d.links ?? { userId: null, prospectId: null, outreachId: null } };
      setEmailDetails((prev) => ({ ...prev, [id]: detail }));
      return detail;
    } catch {
      setDetailFailedIds((prev) => new Set(prev).add(id));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!threadView) reload();
  }, [reload, threadView]);

  // ─── Read / archive primitives ─────────────────────────────────────────────

  const applyLocal = useCallback((ids: string[], patch: Partial<EmailRow>) => {
    const set = new Set(ids);
    setEmailList((prev) => prev.map((e) => (set.has(e.id) ? { ...e, ...patch } : e)));
    setThreadEmails((prev) => prev.map((e) => (set.has(e.id) ? { ...e, ...patch } : e)));
  }, []);

  const setRead = useCallback(async (ids: string[], read: boolean, silent = false) => {
    if (ids.length === 0) return true;
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update emails'));
      const now = new Date().toISOString();
      applyLocal(ids, read ? { readAt: now } : { readAt: null });
      setUnreadTotal((n) => Math.max(0, n + (read ? -ids.length : ids.length)));
      void refreshAdminBadges();
      if (!silent) toast.success(read ? `Marked ${ids.length} as read` : `Marked ${ids.length} as unread`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update emails');
      return false;
    }
  }, [applyLocal]);

  const setArchived = useCallback(async (ids: string[], archived: boolean) => {
    if (ids.length === 0) return false;
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, archived }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update emails'));
      void refreshAdminBadges();
      toast.success(archived ? `Archived ${ids.length}` : `Restored ${ids.length}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update emails');
      return false;
    }
  }, []);

  // ─── Navigation ────────────────────────────────────────────────────────────

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function switchTab(newTab: Tab) {
    if (searchParams.get('thread')) router.replace('/admin/emails');
    setTab(newTab);
    setFilter('all');
    setCategory(null);
    setPagination((p) => ({ ...p, page: 1 }));
    setExpandedId(null);
    setReplyingTo(null);
    setSelectedIds(new Set());
    setThreadView(null);
  }

  function switchFilter(next: Filter) {
    setFilter(next);
    setPagination((p) => ({ ...p, page: 1 }));
    setExpandedId(null);
    setSelectedIds(new Set());
  }

  function switchCategory(next: string | null) {
    setCategory(next);
    setPagination((p) => ({ ...p, page: 1 }));
    setExpandedId(null);
    setSelectedIds(new Set());
  }

  // ─── Thread view ───────────────────────────────────────────────────────────

  const openThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    setThreadView(threadId);
    setReplyingTo(null);
    try {
      const res = await fetch(`/api/admin/emails?thread_id=${threadId}`);
      if (!res.ok) throw new Error(await readError(res, 'Failed to load thread'));
      const d = await res.json();
      const rows: EmailRow[] = d.data ?? [];
      setThreadEmails(rows);
      // Thread rows are slim headers — fetch each email's body on demand
      rows.forEach((e) => { if (!detailsRef.current[e.id]) void loadEmailDetail(e.id); });
      // Opening a conversation reads every unopened message in it
      const unreadIds = rows.filter(isUnread).map((e) => e.id);
      if (unreadIds.length > 0) void setRead(unreadIds, true, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }, [loadEmailDetail, setRead]);

  function closeThread() {
    setThreadView(null);
    setThreadEmails([]);
    setReplyingTo(null);
    if (searchParams.get('thread')) router.replace('/admin/emails');
  }

  // Deep link from other admin pages: /admin/emails?thread=<id>
  const deepLinkedThread = searchParams.get('thread');
  useEffect(() => {
    if (deepLinkedThread) void openThread(deepLinkedThread);
  }, [deepLinkedThread, openThread]);

  // ─── Bulk actions ──────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === emailList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emailList.map((e) => e.id)));
    }
  }

  async function bulkSetRead(read: boolean) {
    const ids = Array.from(selectedIds);
    if (await setRead(ids, read)) {
      setSelectedIds(new Set());
      void reload();
    }
  }

  async function bulkArchive(archived: boolean) {
    const ids = Array.from(selectedIds);
    if (await setArchived(ids, archived)) {
      setSelectedIds(new Set());
      setExpandedId(null);
      void reload();
    }
  }

  async function performDelete(ids: string[]) {
    const res = await fetch('/api/admin/emails', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids.length === 1 ? { id: ids[0] } : { ids }),
    }).catch(() => null);
    if (!res) {
      toast.error('Network error');
      return;
    }
    if (!res.ok) {
      toast.error(await readError(res, 'Failed to delete'));
      return;
    }
    toast.success(ids.length === 1 ? 'Email deleted' : `Deleted ${ids.length} emails`);
    void refreshAdminBadges();
    setSelectedIds(new Set());
    setExpandedId((cur) => (cur && ids.includes(cur) ? null : cur));
    if (threadView) {
      if (ids.includes(threadView)) closeThread();
      else void openThread(threadView);
    } else {
      void reload();
    }
  }

  // ─── Single-email actions ──────────────────────────────────────────────────

  const handleExpand = useCallback((email: EmailRow) => {
    setExpandedId((current) => {
      if (current === email.id) return null;
      return email.id;
    });
    if (expandedId !== email.id) {
      setReplyingTo(null);
      if (!emailDetails[email.id]) void loadEmailDetail(email.id);
      if (isUnread(email)) void setRead([email.id], true, true);
    }
  }, [expandedId, emailDetails, loadEmailDetail, setRead]);

  async function archiveOne(email: EmailRow) {
    const archived = !email.archivedAt;
    if (await setArchived([email.id], archived)) {
      setExpandedId(null);
      setReplyingTo(null);
      void reload();
    }
  }

  async function archiveThread() {
    const ids = threadEmails.map((e) => e.id);
    if (ids.length === 0) return;
    if (await setArchived(ids, true)) closeThread();
  }

  function startReply(email: EmailRow, seed = '') {
    setReplySeed(seed);
    setReplyingTo(email.id);
  }

  /** Open the composer prefilled as a forward of this email (needs its body). */
  async function startForward(email: EmailRow) {
    const detail = emailDetails[email.id] ?? await loadEmailDetail(email.id);
    if (!detail) {
      toast.error('Could not load the original message, so it cannot be forwarded yet.');
      return;
    }
    setForwardOf(email);
    setIncludeOriginalAttachments(true);
    setComposeTo('');
    setComposeSubject(forwardSubject(email.subject));
    setComposeBody(forwardBody(email, detail));
    setAttachments([]);
    setReplyingTo(null);
    setComposing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeCompose() {
    setComposing(false);
    setAttachments([]);
    // A plain draft survives Cancel (re-open to continue); a forward does not.
    if (forwardOf) {
      setForwardOf(null);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
    }
  }

  function onDrafted(email: EmailRow, draft: { aiDraftText: string; aiDraftedAt: string }) {
    setEmailDetails((prev) => (prev[email.id] ? { ...prev, [email.id]: { ...prev[email.id], ...draft } } : prev));
    applyLocal([email.id], { aiDraftedAt: draft.aiDraftedAt });
  }

  async function handleSendAiDraft(email: EmailRow, detail: EmailDetail) {
    if (!detail.aiDraftText) return;
    setSendingId(`ai-${email.id}`);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: replySubject(email.subject),
          html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(detail.aiDraftText).replace(/\n/g, '<br />')}${quotedHtml(email, detail)}</div>`,
          text: `${detail.aiDraftText}${quotedText(email, detail)}`,
          inReplyToId: email.id,
        }),
      });
      if (res.ok) {
        toast.success(`AI reply sent to ${email.fromEmail}`);
        applyLocal([email.id], { status: 'replied', hasResponse: true, readAt: email.readAt ?? new Date().toISOString() });
        void refreshAdminBadges();
      } else {
        toast.error(await readError(res, 'Failed to send'));
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingId(null);
    }
  }

  function onReplySent(email: EmailRow) {
    setReplyingTo(null);
    setReplySeed('');
    applyLocal([email.id], { status: 'replied', readAt: email.readAt ?? new Date().toISOString() });
    void refreshAdminBadges();
    if (threadView) void openThread(threadView);
    else void reload();
  }

  async function handleCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    const to = composeTo.trim();
    const outgoing = attachments.length > 0
      ? { attachments: attachments.map(({ content, filename, contentType }) => ({ content, filename, contentType })) }
      : {};
    setSendingId('compose');
    try {
      // A forward goes through the original's /forward endpoint, which builds
      // the HTML and re-attaches the original files server-side.
      const res = forwardOf
        ? await fetch(`/api/admin/emails/${forwardOf.id}/forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to,
              subject: composeSubject,
              text: composeBody,
              includeAttachments: includeOriginalAttachments,
              ...outgoing,
            }),
          })
        : await fetch('/api/admin/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to,
              subject: composeSubject,
              html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(composeBody).replace(/\n/g, '<br />')}</div>`,
              text: composeBody,
              ...outgoing,
            }),
          });
      if (res.ok) {
        if (forwardOf) {
          const d = await res.json().catch(() => ({}));
          const skipped: number = d?.attachments?.skipped ?? 0;
          toast.success(
            skipped > 0
              ? `Forwarded to ${to} — ${skipped} attachment${skipped === 1 ? ' was' : 's were'} too large to include`
              : `Forwarded to ${to}`,
          );
          // The server counts an unopened original as read and roots its thread.
          applyLocal([forwardOf.id], {
            readAt: forwardOf.readAt ?? new Date().toISOString(),
            status: forwardOf.status === 'received' ? 'read' : forwardOf.status,
            threadId: forwardOf.threadId ?? forwardOf.id,
          });
          void refreshAdminBadges();
          if (threadView) void openThread(threadView);
        } else {
          toast.success(`Email sent to ${to}`);
        }
        setComposing(false);
        setForwardOf(null);
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setAttachments([]);
        if (tab === 'sent' && !threadView) void reload();
      } else {
        toast.error(await readError(res, 'Failed to send'));
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingId(null);
    }
  }

  // ─── Keyboard shortcuts (j/k navigate, r reply, f forward, e archive) ──────

  const latest = useRef({ emailList, expandedId, threadView, tab, handleExpand, archiveOne, startReply, startForward });
  latest.current = { emailList, expandedId, threadView, tab, handleExpand, archiveOne, startReply, startForward };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const s = latest.current;
      if (s.threadView) return;
      if (e.key === 'j' || e.key === 'k') {
        if (s.emailList.length === 0) return;
        const idx = s.emailList.findIndex((m) => m.id === s.expandedId);
        const nextIdx = e.key === 'j'
          ? Math.min(s.emailList.length - 1, idx + 1)
          : Math.max(0, idx === -1 ? 0 : idx - 1);
        const next = s.emailList[nextIdx];
        if (next && next.id !== s.expandedId) {
          s.handleExpand(next);
          document.getElementById(`email-${next.id}`)?.scrollIntoView({ block: 'nearest' });
        }
        e.preventDefault();
      } else if (e.key === 'r') {
        const cur = s.emailList.find((m) => m.id === s.expandedId);
        if (cur && cur.direction === 'inbound') {
          s.startReply(cur);
          e.preventDefault();
        }
      } else if (e.key === 'f') {
        const cur = s.emailList.find((m) => m.id === s.expandedId);
        if (cur) {
          void s.startForward(cur);
          e.preventDefault();
        }
      } else if (e.key === 'e') {
        const cur = s.emailList.find((m) => m.id === s.expandedId);
        if (cur) {
          void s.archiveOne(cur);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Render helpers ────────────────────────────────────────────────────────

  const unreadCount = unreadTotal;
  const expandedDetail = expandedId ? emailDetails[expandedId] : undefined;
  const expandedDetailFailed = expandedId ? detailFailedIds.has(expandedId) : false;
  const showingArchived = filter === 'archived';

  const confirmDialog = (
    <ConfirmDialog
      open={!!confirmDelete}
      onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      title={confirmDelete?.label ?? 'Delete'}
      description="This permanently removes the message from the inbox. Replies in the same conversation are kept and re-threaded. This cannot be undone."
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={async () => { if (confirmDelete) await performDelete(confirmDelete.ids); }}
    />
  );

  // Compose / forward form — shown above the list and above a thread, so a
  // forward started from either view opens in place.
  const composeCard = composing && (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{forwardOf ? 'Forward Email' : 'New Email'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {forwardOf && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Forward className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="min-w-0 truncate">
              Forwarding <strong className="text-foreground">{forwardOf.subject || '(no subject)'}</strong>
              {' '}from {forwardOf.fromName || forwardOf.fromEmail}
            </span>
            {forwardOf.direction === 'inbound' && forwardOf.hasAttachments && (
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={includeOriginalAttachments}
                  onChange={(e) => setIncludeOriginalAttachments(e.target.checked)}
                  className="accent-champagne"
                />
                Include original attachments
              </label>
            )}
          </div>
        )}
        <input
          type="email"
          placeholder="To email address"
          value={composeTo}
          onChange={(e) => setComposeTo(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          autoFocus={!!forwardOf}
        />
        <input
          type="text"
          placeholder="Subject"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background"
        />
        <Textarea
          placeholder="Write your message..."
          value={composeBody}
          onChange={(e) => setComposeBody(e.target.value)}
          rows={forwardOf ? 12 : 6}
        />
        <AttachmentChips items={attachments} onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleCompose}
            disabled={sendingId === 'compose'}
            className="bg-champagne text-charcoal hover:bg-champagne/90"
          >
            {forwardOf ? <Forward className="h-3.5 w-3.5 mr-2" /> : <Send className="h-3.5 w-3.5 mr-2" />}
            {sendingId === 'compose' ? 'Sending...' : forwardOf ? 'Forward' : 'Send'}
          </Button>
          <TemplateMenu
            onPickTemplate={(t) => {
              if (!composeSubject.trim()) setComposeSubject(t.subject);
              setComposeBody(t.body);
            }}
            onInsertSignature={() => setComposeBody((b) => appendSignature(b))}
          />
          <label className="cursor-pointer">
            <input type="file" multiple className="hidden" onChange={(e) => readFilesInto(e, attachments, setAttachments)} />
            <Button size="sm" variant="outline" type="button" asChild>
              <span>
                <Paperclip className="h-3.5 w-3.5 mr-1" />
                Attach
              </span>
            </Button>
          </label>
          <Button size="sm" variant="outline" onClick={closeCompose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Thread view render ────────────────────────────────────────────────────

  if (threadView) {
    const threadSubject = threadEmails[0]?.subject || 'Thread';
    // Forwards hang off the message they forwarded (inReplyToId) but are not
    // replies — group them so each original can say where it went.
    const threadById = new Map(threadEmails.map((e) => [e.id, e]));
    const forwardsByParent = new Map<string, EmailRow[]>();
    for (const e of threadEmails) {
      if (e.inReplyToId && isForwardOf(e, threadById.get(e.inReplyToId))) {
        forwardsByParent.set(e.inReplyToId, [...(forwardsByParent.get(e.inReplyToId) ?? []), e]);
      }
    }
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={closeThread}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="font-display text-display-sm truncate">{threadSubject}</h1>
          </div>
          {threadEmails.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{threadEmails.length} message{threadEmails.length === 1 ? '' : 's'}</span>
              <Button size="sm" variant="outline" onClick={archiveThread}>
                <Archive className="h-3.5 w-3.5 mr-1" />
                Archive thread
              </Button>
            </div>
          )}
        </div>

        {composeCard}

        {threadLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : threadEmails.length === 0 ? (
          <p className="text-muted-foreground">No emails in this thread.</p>
        ) : (
          <div className="space-y-4">
            {threadEmails.map((email) => {
              const detail = emailDetails[email.id];
              const isForward = isForwardOf(email, email.inReplyToId ? threadById.get(email.inReplyToId) : undefined);
              const forwards = forwardsByParent.get(email.id) ?? [];
              return (
                <Card key={email.id} className={email.direction === 'outbound' ? 'sm:ml-8 border-champagne/30' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {email.direction === 'inbound'
                            ? email.fromName || email.fromEmail
                            : `Mayells → ${email.toEmail}`}
                        </span>
                        {isForward && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Forward className="h-2.5 w-2.5" />
                            Forwarded
                          </Badge>
                        )}
                        <StatusBadge status={email.status} />
                        {email.aiAutoSent && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1 text-xs">
                            <Bot className="h-2.5 w-2.5" />
                            AI
                          </Badge>
                        )}
                        {email.archivedAt && (
                          <Badge variant="outline" className="gap-1 text-xs"><Archive className="h-2.5 w-2.5" />Archived</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(email.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{email.subject}</p>
                    {detail?.links && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        <CounterpartyLinks links={detail.links} />
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <EmailBody detail={detail} failed={detailFailedIds.has(email.id)} compact />
                    {email.direction === 'inbound' && email.hasAttachments && (
                      <EmailAttachments emailId={email.id} />
                    )}
                    {forwards.map((f) => (
                      <p key={f.id} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Forward className="h-3 w-3" />
                        Forwarded to {f.toEmail} on{' '}
                        {new Date(f.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    ))}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {email.direction === 'inbound' && replyingTo !== email.id && (
                        <Button size="sm" variant="outline" onClick={() => startReply(email)}>
                          <Reply className="h-3.5 w-3.5 mr-2" />
                          Reply
                        </Button>
                      )}
                      {replyingTo !== email.id && (
                        <Button size="sm" variant="outline" onClick={() => void startForward(email)}>
                          <Forward className="h-3.5 w-3.5 mr-2" />
                          Forward
                        </Button>
                      )}
                      {replyingTo !== email.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 ml-auto"
                          onClick={() => setConfirmDelete({ ids: [email.id], label: 'Delete this message?' })}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                    {replyingTo === email.id && (
                      <div className="mt-3">
                        <ReplyComposer
                          key={`${email.id}-${replySeed}`}
                          email={email}
                          detail={detail}
                          initialBody={replySeed}
                          onSent={() => onReplySent(email)}
                          onCancel={() => { setReplyingTo(null); setReplySeed(''); }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {confirmDialog}
      </div>
    );
  }

  // ─── Main view render ──────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-display-sm">Email</h1>
          {tab === 'inbox' && pagination.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pagination.total} {pagination.total === 1 ? 'email' : 'emails'}
              {unreadCount > 0 && ` · ${unreadCount} unread`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden lg:flex items-center gap-1 text-[11px] text-muted-foreground" title="Keyboard: j/k next & previous, r reply, f forward, e archive">
            <Keyboard className="h-3.5 w-3.5" />
            j/k · r · f · e
          </span>
          <Button
            onClick={() => (composing ? closeCompose() : setComposing(true))}
            className="bg-champagne text-charcoal hover:bg-champagne/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Compose
          </Button>
        </div>
      </div>

      {composeCard}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b overflow-x-auto">
          <button
            onClick={() => switchTab('inbox')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === 'inbox'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-champagne/20 text-champagne text-xs px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => switchTab('sent')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === 'sent'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Send className="h-4 w-4" />
            Sent
          </button>
          <button
            onClick={() => switchTab('spam')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === 'spam'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Spam
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search email, name, subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm bg-background w-64 max-w-full"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
          {searchQuery && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setSearchInput(''); setSearchQuery(''); setPagination((p) => ({ ...p, page: 1 })); }}
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(tab === 'inbox' ? (['all', 'unread', 'needs_review', 'archived'] as Filter[]) : (['all', 'archived'] as Filter[])).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => switchFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-champagne bg-champagne/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-champagne/50'
            }`}
          >
            {filterLabels[f]}
            {f === 'unread' && unreadCount > 0 && <span className="ml-1 text-champagne">{unreadCount}</span>}
          </button>
        ))}
        {tab === 'inbox' && categories.length > 0 && (
          <>
            <span className="h-4 w-px bg-border mx-1" aria-hidden />
            {categories.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => switchCategory(category === c.category ? null : c.category)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  category === c.category
                    ? 'border-purple-300 bg-purple-50 text-purple-800'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-purple-200'
                }`}
              >
                <Bot className="h-2.5 w-2.5" />
                {categoryLabels[c.category] || c.category}
                <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
          <span className="text-sm font-medium mr-1">{selectedIds.size} selected</span>
          {tab !== 'sent' && (
            <>
              <Button size="sm" variant="outline" onClick={() => bulkSetRead(true)}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Mark read
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkSetRead(false)}>
                <MailOpen className="h-3.5 w-3.5 mr-1" />
                Mark unread
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => bulkArchive(!showingArchived)}>
            {showingArchived ? <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
            {showingArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={() => setConfirmDelete({ ids: Array.from(selectedIds), label: `Delete ${selectedIds.size} email${selectedIds.size > 1 ? 's' : ''}?` })}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      )}

      {/* Email List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Could not load emails</p>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => reload()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : emailList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery
                ? `No emails matching "${searchQuery}"`
                : filter === 'needs_review' ? 'Nothing needs review.'
                : filter === 'unread' ? 'No unread emails.'
                : filter === 'archived' ? 'No archived emails.'
                : category ? `No ${categoryLabels[category] || category} emails.`
                : tab === 'inbox' ? 'No incoming emails yet.'
                : tab === 'sent' ? 'No sent emails yet.'
                : 'No spam emails.'
              }
            </p>
            {filter === 'needs_review' && !searchQuery && (
              <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
                Needs review lists emails the AI replied to automatically, and emails with an AI draft
                that has not been sent yet — check the auto-replies, then send, edit, or archive the drafts.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <button
              onClick={toggleSelectAll}
              className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                selectedIds.size === emailList.length
                  ? 'bg-champagne border-champagne'
                  : 'border-border hover:border-champagne/50'
              }`}
              aria-label="Select all"
            >
              {selectedIds.size === emailList.length && <Check className="h-3 w-3 text-charcoal" />}
            </button>
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>

          <div className="space-y-2">
            {emailList.map((email) => {
              const unread = isUnread(email);
              const isExpanded = expandedId === email.id;
              return (
              <Card
                key={email.id}
                id={`email-${email.id}`}
                className={`transition-colors ${
                  selectedIds.has(email.id)
                    ? 'border-champagne bg-champagne/5'
                    : unread
                      ? 'border-champagne/40 bg-champagne/5'
                      : email.status === 'bounced'
                        ? 'border-red-200 bg-red-50/30'
                        : isExpanded
                          ? 'border-champagne/60'
                          : ''
                }`}
              >
                {/* Email Row Header */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(email.id); }}
                    className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedIds.has(email.id)
                        ? 'bg-champagne border-champagne'
                        : 'border-border hover:border-champagne/50'
                    }`}
                    aria-label="Select email"
                  >
                    {selectedIds.has(email.id) && <Check className="h-3 w-3 text-charcoal" />}
                  </button>

                  {/* Clickable email row */}
                  <button
                    onClick={() => handleExpand(email)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-3">
                      {unread && (
                        <Circle className="h-2.5 w-2.5 fill-champagne text-champagne flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <p className={`text-sm truncate ${unread ? 'font-semibold' : ''}`}>
                              {tab === 'inbox' || tab === 'spam'
                                ? email.fromName || email.fromEmail
                                : email.toName || email.toEmail}
                            </p>
                            {email.userId && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800 gap-1 text-xs">
                                <User className="h-2.5 w-2.5" />
                                User
                              </Badge>
                            )}
                            <StatusBadge status={email.status} />
                            {email.direction === 'outbound' && email.hasResponse && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1 text-xs">
                                <Reply className="h-3 w-3" />
                                Customer replied
                              </Badge>
                            )}
                            {email.aiAutoSent && email.direction === 'inbound' && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1 text-xs">
                                <Bot className="h-2.5 w-2.5" />
                                Auto-replied
                              </Badge>
                            )}
                            {email.aiCategory && email.aiCategory !== 'spam' && (
                              <CategoryBadge category={email.aiCategory} confidence={email.aiConfidence} />
                            )}
                            {email.archivedAt && (
                              <Badge variant="outline" className="gap-1 text-xs"><Archive className="h-2.5 w-2.5" />Archived</Badge>
                            )}
                            {email.threadId && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); openThread(email.threadId!); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openThread(email.threadId!); } }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title="View thread"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {new Date(email.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className={`text-sm truncate mt-0.5 flex items-center gap-1.5 ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {email.hasAttachments && (
                            <Paperclip className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{email.subject || '(no subject)'}</span>
                        </p>
                        {/* AI summary or body preview */}
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {email.aiSummary || email.preview || ''}
                          </p>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Row actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="flex-shrink-0 text-muted-foreground"
                        aria-label="Email actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {email.direction === 'inbound' && (
                        <DropdownMenuItem onSelect={() => { if (expandedId !== email.id) handleExpand(email); startReply(email); }}>
                          <Reply className="h-3.5 w-3.5 mr-1" />
                          Reply
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => void startForward(email)}>
                        <Forward className="h-3.5 w-3.5 mr-1" />
                        Forward
                      </DropdownMenuItem>
                      {email.direction === 'inbound' && (
                        <DropdownMenuItem onSelect={() => void setRead([email.id], !email.readAt)}>
                          {email.readAt ? <MailOpen className="h-3.5 w-3.5 mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          {email.readAt ? 'Mark unread' : 'Mark read'}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => void archiveOne(email)}>
                        {email.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
                        {email.archivedAt ? 'Unarchive' : 'Archive'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={() => setConfirmDelete({ ids: [email.id], label: 'Delete this email?' })}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Expanded Email Body */}
                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3 pt-3">
                      <span>From: <strong className="text-foreground">{email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}</strong></span>
                      <span>To: <strong className="text-foreground">{email.toEmail}</strong></span>
                      <CounterpartyLinks links={expandedDetail?.links ?? (email.userId ? { userId: email.userId, prospectId: null, outreachId: null } : undefined)} />
                    </div>

                    {/* AI Classification Info */}
                    {email.aiCategory && (
                      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
                        <CategoryBadge category={email.aiCategory} confidence={email.aiConfidence} />
                        {email.aiSummary && (
                          <span className="text-muted-foreground italic">{email.aiSummary}</span>
                        )}
                      </div>
                    )}

                    <EmailBody detail={expandedDetail} failed={expandedDetailFailed} />

                    {/* Inbound attachments (fresh signed URLs fetched on expand) */}
                    {email.direction === 'inbound' && email.hasAttachments && (
                      <EmailAttachments emailId={email.id} />
                    )}

                    {/* AI Draft */}
                    {expandedDetail?.aiDraftText && email.direction === 'inbound' && !email.aiAutoSent && email.status !== 'replied' && (
                      <div className="mt-4 border border-purple-200 bg-purple-50/30 rounded-lg p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Bot className="h-4 w-4 text-purple-600" />
                          <span className="text-sm font-medium text-purple-800">AI Draft Reply</span>
                          <span className="text-xs text-purple-500">
                            {expandedDetail.aiDraftedAt && `Generated ${new Date(expandedDetail.aiDraftedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                          </span>
                        </div>
                        <pre className="text-sm whitespace-pre-wrap text-foreground mb-3">{expandedDetail.aiDraftText}</pre>
                        <AiDraftControls
                          key={`draft-${email.id}`}
                          email={email}
                          hasDraft
                          onDrafted={(d) => onDrafted(email, d)}
                        >
                          <Button
                            size="sm"
                            onClick={() => handleSendAiDraft(email, expandedDetail)}
                            disabled={sendingId === `ai-${email.id}`}
                            className="bg-purple-600 text-white hover:bg-purple-700"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-2" />
                            {sendingId === `ai-${email.id}` ? 'Sending...' : 'Send AI Draft'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startReply(email, expandedDetail.aiDraftText || '')}
                          >
                            Edit & Send
                          </Button>
                        </AiDraftControls>
                      </div>
                    )}

                    {/* No draft yet (or the AI skipped it): let the operator ask for one */}
                    {expandedDetail && !expandedDetail.aiDraftText && email.direction === 'inbound'
                      && !email.aiAutoSent && email.status !== 'replied' && replyingTo !== email.id && (
                      <div className="mt-4 border border-dashed border-purple-200 rounded-lg p-3">
                        <p className="text-xs text-purple-700 mb-2 flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5" />
                          No AI draft for this email yet.
                        </p>
                        <AiDraftControls
                          key={`draft-${email.id}`}
                          email={email}
                          hasDraft={false}
                          onDrafted={(d) => onDrafted(email, d)}
                        />
                      </div>
                    )}

                    {/* Auto-sent indicator */}
                    {email.aiAutoSent && email.direction === 'inbound' && (
                      <div className="mt-4 flex items-center gap-2 text-xs text-purple-600">
                        <Bot className="h-3.5 w-3.5" />
                        AI auto-replied to this email
                        {email.aiCategory && <span>({categoryLabels[email.aiCategory] || email.aiCategory})</span>}
                        {email.threadId && (
                          <button type="button" className="underline" onClick={() => openThread(email.threadId!)}>
                            see the reply
                          </button>
                        )}
                      </div>
                    )}

                    {/* Reply composer */}
                    {replyingTo === email.id && (
                      <div className="mt-4">
                        <ReplyComposer
                          key={`${email.id}-${replySeed}`}
                          email={email}
                          detail={expandedDetailFailed ? null : expandedDetail}
                          initialBody={replySeed}
                          onSent={() => onReplySent(email)}
                          onCancel={() => { setReplyingTo(null); setReplySeed(''); }}
                        />
                      </div>
                    )}

                    {/* Actions row */}
                    {replyingTo !== email.id && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {/* Reply is always available for inbound mail — the quote is
                            simply omitted if the body could not be loaded */}
                        {email.direction === 'inbound' && (
                          <Button size="sm" variant="outline" onClick={() => startReply(email)}>
                            <Reply className="h-3.5 w-3.5 mr-2" />
                            Reply
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => void startForward(email)}>
                          <Forward className="h-3.5 w-3.5 mr-2" />
                          Forward
                        </Button>
                        {email.threadId && (
                          <Button size="sm" variant="outline" onClick={() => openThread(email.threadId!)}>
                            <MessageSquare className="h-3.5 w-3.5 mr-2" />
                            View Thread
                          </Button>
                        )}
                        {email.direction === 'inbound' && email.readAt && (
                          <Button size="sm" variant="outline" onClick={() => setRead([email.id], false)}>
                            <MailOpen className="h-3.5 w-3.5 mr-2" />
                            Mark unread
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => archiveOne(email)}>
                          {email.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> : <Archive className="h-3.5 w-3.5 mr-2" />}
                          {email.archivedAt ? 'Unarchive' : 'Archive'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 ml-auto"
                          onClick={() => setConfirmDelete({ ids: [email.id], label: 'Delete this email?' })}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} emails)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {confirmDialog}
    </div>
  );
}

export default function AdminEmailsPage() {
  // useSearchParams (for ?thread= deep links) requires a Suspense boundary
  return (
    <Suspense fallback={<div className="h-24 bg-muted animate-pulse rounded-lg" />}>
      <AdminEmailsPageInner />
    </Suspense>
  );
}
