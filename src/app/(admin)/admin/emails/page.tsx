'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SandboxedEmail } from '@/components/admin/SandboxedEmail';
import {
  Inbox, Send, Mail, Reply, Plus, ChevronDown, ChevronUp, Circle,
  Search, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle, Clock,
  ShieldAlert, User, Bot, Sparkles, Trash2, Check, X, ArrowLeft,
  MessageSquare, Paperclip, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { escapeHtml } from '@/lib/email/escape';

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
  readAt: string | null;
  createdAt: string;
  preview: string;
  hasAttachments: boolean;
}

// Heavy fields of the full email row, fetched per email on expand
interface EmailDetail {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  aiDraftText: string | null;
  aiDraftedAt: string | null;
}

interface AttachmentLink {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  downloadUrl: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type Tab = 'inbox' | 'sent' | 'spam';

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
  other: 'Other',
};

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function QuotedOriginal({ email, detail }: { email: EmailRow; detail: EmailDetail }) {
  const text = detail.bodyText || '';
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

export default function AdminEmailsPage() {
  const [tab, setTab] = useState<Tab>('inbox');
  const [emailList, setEmailList] = useState<EmailRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 30, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emailDetails, setEmailDetails] = useState<Record<string, EmailDetail>>({});
  const [detailFailedIds, setDetailFailedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<{ content: string; filename: string; contentType: string }[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Compose state
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [attachments, setAttachments] = useState<{ content: string; filename: string; contentType: string }[]>([]);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Thread view
  const [threadView, setThreadView] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<EmailRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const fetchEmails = useCallback((currentTab: Tab, page: number, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });

    if (currentTab === 'spam') {
      params.set('direction', 'inbound');
      params.set('spam', 'true');
    } else {
      params.set('direction', currentTab === 'inbox' ? 'inbound' : 'outbound');
      params.set('spam', 'false');
    }

    if (search) params.set('search', search);

    fetch(`/api/admin/emails?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load emails');
        return r.json();
      })
      .then((d) => {
        setLoadError(false);
        setEmailList(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
        if (typeof d.unread === 'number') setUnreadTotal(d.unread);
      })
      .catch(() => {
        setLoadError(true);
        toast.error('Failed to load emails');
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch the heavy fields (bodies, AI draft) of one email, cached by id
  const loadEmailDetail = useCallback((id: string) => {
    setDetailFailedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    fetch(`/api/admin/emails/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEmailDetails((prev) => ({ ...prev, [id]: d.data })))
      .catch(() => setDetailFailedIds((prev) => new Set(prev).add(id)));
  }, []);

  useEffect(() => {
    if (!threadView) {
      fetchEmails(tab, pagination.page, searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pagination.page, searchQuery]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function switchTab(newTab: Tab) {
    setTab(newTab);
    setPagination((p) => ({ ...p, page: 1 }));
    setExpandedId(null);
    setSelectedIds(new Set());
    setThreadView(null);
  }

  // ─── Thread View ─────────────────────────────────────────────────────────────

  async function openThread(threadId: string) {
    setThreadLoading(true);
    setThreadView(threadId);
    try {
      const res = await fetch(`/api/admin/emails?thread_id=${threadId}`);
      if (!res.ok) throw new Error('Failed to load thread');
      const d = await res.json();
      const rows: EmailRow[] = d.data ?? [];
      setThreadEmails(rows);
      // Thread rows are slim headers — fetch each email's body on demand
      rows.forEach((e) => {
        if (!emailDetails[e.id]) loadEmailDetail(e.id);
      });
    } catch {
      toast.error('Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }

  function closeThread() {
    setThreadView(null);
    setThreadEmails([]);
  }

  // ─── Bulk Actions ────────────────────────────────────────────────────────────

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

  async function bulkMarkRead() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: 'read' }),
      });
      if (!res.ok) throw new Error('Failed to update emails');
      const newlyRead = emailList.filter((e) => selectedIds.has(e.id) && e.direction === 'inbound' && e.status === 'received').length;
      setUnreadTotal((n) => Math.max(0, n - newlyRead));
      setEmailList((prev) => prev.map((e) => (selectedIds.has(e.id) ? { ...e, status: 'read', readAt: new Date().toISOString() } : e)));
      setSelectedIds(new Set());
      toast.success(`Marked ${ids.length} emails as read`);
    } catch {
      toast.error('Failed to update emails');
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} email${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to delete emails');
      setEmailList((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setPagination((p) => ({ ...p, total: p.total - ids.length }));
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} emails`);
    } catch {
      toast.error('Failed to delete emails');
    }
  }

  async function deleteEmail(id: string) {
    if (!confirm('Delete this email? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete email');
      setEmailList((prev) => prev.filter((e) => e.id !== id));
      setPagination((p) => ({ ...p, total: p.total - 1 }));
      setExpandedId(null);
      toast.success('Email deleted');
    } catch {
      toast.error('Failed to delete email');
    }
  }

  // ─── Email Actions ───────────────────────────────────────────────────────────

  async function handleSendAiDraft(email: EmailRow, detail: EmailDetail) {
    if (!detail.aiDraftText) return;
    setSendingId(`ai-${email.id}`);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
              ${escapeHtml(detail.aiDraftText).replace(/\n/g, '<br />')}
              <br /><br />
              <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666; font-size: 13px;">
                <p style="margin: 0 0 4px;">On ${new Date(email.createdAt).toLocaleDateString()}, ${escapeHtml(email.fromName || email.fromEmail)} wrote:</p>
                <div>${detail.bodyHtml || escapeHtml(detail.bodyText || '').replace(/\n/g, '<br />') || ''}</div>
              </div>
            </div>
          `,
          text: `${detail.aiDraftText}\n\n> On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:\n> ${(detail.bodyText || '').split('\n').join('\n> ')}`,
          inReplyToId: email.id,
        }),
      });
      if (res.ok) {
        toast.success(`AI reply sent to ${email.fromEmail}`);
        setEmailList((prev) => prev.map((e) => (e.id === email.id ? { ...e, status: 'replied' } : e)));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingId(null);
    }
  }

  async function markAsRead(id: string) {
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'read' }),
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      setUnreadTotal((n) => Math.max(0, n - 1));
      setEmailList((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'read', readAt: new Date().toISOString() } : e)));
    } catch {
      toast.error('Failed to mark email as read');
    }
  }

  function handleExpand(email: EmailRow) {
    if (expandedId === email.id) {
      setExpandedId(null);
    } else {
      setExpandedId(email.id);
      if (!emailDetails[email.id]) loadEmailDetail(email.id);
      if (email.direction === 'inbound' && email.status === 'received') {
        markAsRead(email.id);
      }
    }
  }

  async function handleReply(email: EmailRow, detail: EmailDetail) {
    if (!replyBody.trim()) return;
    setSendingId(`reply-${email.id}`);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
              ${escapeHtml(replyBody).replace(/\n/g, '<br />')}
              <br /><br />
              <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666; font-size: 13px;">
                <p style="margin: 0 0 4px;">On ${new Date(email.createdAt).toLocaleDateString()}, ${escapeHtml(email.fromName || email.fromEmail)} wrote:</p>
                <div>${detail.bodyHtml || escapeHtml(detail.bodyText || '').replace(/\n/g, '<br />') || ''}</div>
              </div>
            </div>
          `,
          text: `${replyBody}\n\n> On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:\n> ${(detail.bodyText || '').split('\n').join('\n> ')}`,
          inReplyToId: email.id,
          ...(replyAttachments.length > 0 && { attachments: replyAttachments }),
        }),
      });
      if (res.ok) {
        toast.success(`Reply sent to ${email.fromEmail}`);
        setReplyingTo(null);
        setReplyBody('');
        setReplyAttachments([]);
        setEmailList((prev) => prev.map((e) => (e.id === email.id ? { ...e, status: 'replied' } : e)));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send reply');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingId(null);
    }
  }

  function readFilesInto(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<{ content: string; filename: string; contentType: string }[]>>,
  ) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setter((prev) => [...prev, {
          content: base64,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    readFilesInto(e, setAttachments);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSendingId('compose');
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(composeBody).replace(/\n/g, '<br />')}</div>`,
          text: composeBody,
          ...(attachments.length > 0 && { attachments }),
        }),
      });
      if (res.ok) {
        toast.success(`Email sent to ${composeTo}`);
        setComposing(false);
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setAttachments([]);
        if (tab === 'sent') fetchEmails('sent', 1, searchQuery);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingId(null);
    }
  }

  const unreadCount = unreadTotal;

  // Only one row expands at a time — its full body/draft, once fetched
  const expandedDetail = expandedId ? emailDetails[expandedId] : undefined;
  const expandedDetailFailed = expandedId ? detailFailedIds.has(expandedId) : false;

  // ─── Thread View Render ────────────────────────────────────────────────────

  if (threadView) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={closeThread}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="font-display text-display-sm">Thread</h1>
        </div>

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
              return (
                <Card key={email.id} className={email.direction === 'outbound' ? 'ml-8 border-champagne/30' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {email.direction === 'inbound'
                            ? email.fromName || email.fromEmail
                            : `Mayells → ${email.toEmail}`}
                        </span>
                        <StatusBadge status={email.status} />
                        {email.aiAutoSent && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1 text-xs">
                            <Bot className="h-2.5 w-2.5" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(email.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{email.subject}</p>
                  </CardHeader>
                  <CardContent>
                    {detailFailedIds.has(email.id) ? (
                      <p className="text-sm text-red-600">Could not load email content.</p>
                    ) : !detail ? (
                      <div className="h-16 bg-muted animate-pulse rounded-md" />
                    ) : detail.bodyHtml ? (
                      <SandboxedEmail html={detail.bodyHtml} className="rounded-md" />
                    ) : detail.bodyText ? (
                      <pre className="text-sm whitespace-pre-wrap">{detail.bodyText}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">(no content)</p>
                    )}
                    {email.direction === 'inbound' && email.hasAttachments && (
                      <EmailAttachments emailId={email.id} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Main View Render ──────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm">Email</h1>
          {tab === 'inbox' && pagination.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pagination.total} {pagination.total === 1 ? 'email' : 'emails'}
              {unreadCount > 0 && ` · ${unreadCount} unread`}
            </p>
          )}
        </div>
        <Button
          onClick={() => setComposing(!composing)}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Compose
        </Button>
      </div>

      {/* Compose Form */}
      {composing && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="email"
              placeholder="To email address"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
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
              rows={6}
            />
            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 text-xs">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[150px] truncate">{a.filename}</span>
                    <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCompose}
                disabled={sendingId === 'compose'}
                className="bg-champagne text-charcoal hover:bg-champagne/90"
              >
                <Send className="h-3.5 w-3.5 mr-2" />
                {sendingId === 'compose' ? 'Sending...' : 'Send'}
              </Button>
              <label className="cursor-pointer">
                <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                <Button size="sm" variant="outline" type="button" asChild>
                  <span>
                    <Paperclip className="h-3.5 w-3.5 mr-1" />
                    Attach
                  </span>
                </Button>
              </label>
              <Button size="sm" variant="outline" onClick={() => { setComposing(false); setAttachments([]); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 border-b">
          <button
            onClick={() => switchTab('inbox')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'inbox'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Inbox
            {tab === 'inbox' && unreadCount > 0 && (
              <Badge variant="secondary" className="bg-champagne/20 text-champagne text-xs px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => switchTab('sent')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search email, name, subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm bg-background w-64"
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

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          {tab === 'inbox' && (
            <Button size="sm" variant="outline" onClick={bulkMarkRead}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Mark Read
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={bulkDelete}>
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
            <p className="text-muted-foreground mb-4">Failed to load emails.</p>
            <Button variant="outline" size="sm" onClick={() => fetchEmails(tab, pagination.page, searchQuery)}>
              Try again
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
                : tab === 'inbox' ? 'No incoming emails yet.'
                : tab === 'sent' ? 'No sent emails yet.'
                : 'No spam emails.'
              }
            </p>
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
            >
              {selectedIds.size === emailList.length && <Check className="h-3 w-3 text-charcoal" />}
            </button>
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>

          <div className="space-y-2">
            {emailList.map((email) => (
              <Card
                key={email.id}
                className={`transition-colors ${
                  selectedIds.has(email.id)
                    ? 'border-champagne bg-champagne/5'
                    : email.status === 'received' && email.direction === 'inbound'
                      ? 'border-champagne/40 bg-champagne/5'
                      : email.status === 'bounced'
                        ? 'border-red-200 bg-red-50/30'
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
                  >
                    {selectedIds.has(email.id) && <Check className="h-3 w-3 text-charcoal" />}
                  </button>

                  {/* Clickable email row */}
                  <button
                    onClick={() => handleExpand(email)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-3">
                      {email.status === 'received' && email.direction === 'inbound' && (
                        <Circle className="h-2.5 w-2.5 fill-champagne text-champagne flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <p className={`text-sm truncate ${email.status === 'received' && email.direction === 'inbound' ? 'font-semibold' : ''}`}>
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
                            {email.aiCategory && email.aiCategory !== 'spam' && (
                              <CategoryBadge category={email.aiCategory} confidence={email.aiConfidence} />
                            )}
                            {email.threadId && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openThread(email.threadId!); }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title="View thread"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
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
                        <p className={`text-sm truncate mt-0.5 flex items-center gap-1.5 ${email.status === 'received' && email.direction === 'inbound' ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {email.hasAttachments && (
                            <Paperclip className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{email.subject || '(no subject)'}</span>
                        </p>
                        {/* AI summary or body preview */}
                        {expandedId !== email.id && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {email.aiSummary || email.preview || ''}
                          </p>
                        )}
                      </div>
                      {expandedId === email.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Expanded Email Body */}
                {expandedId === email.id && (
                  <CardContent className="pt-0 border-t">
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3 pt-3">
                      <span>From: <strong className="text-foreground">{email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}</strong></span>
                      <span>To: <strong className="text-foreground">{email.toEmail}</strong></span>
                      {email.userId && (
                        <a
                          href={`/admin/clients/${email.userId}`}
                          className="flex items-center gap-1 text-purple-600 hover:text-purple-800 transition-colors"
                        >
                          <User className="h-3 w-3" />
                          View user profile
                        </a>
                      )}
                    </div>

                    {/* AI Classification Info */}
                    {email.aiCategory && (
                      <div className="flex items-center gap-3 mb-3 text-xs">
                        <CategoryBadge category={email.aiCategory} confidence={email.aiConfidence} />
                        {email.aiSummary && (
                          <span className="text-muted-foreground italic">{email.aiSummary}</span>
                        )}
                      </div>
                    )}

                    {expandedDetailFailed ? (
                      <p className="text-sm text-red-600 p-4">Could not load email content.</p>
                    ) : !expandedDetail ? (
                      <div className="h-24 bg-muted animate-pulse rounded-md" />
                    ) : expandedDetail.bodyHtml ? (
                      <div className="bg-muted/30 rounded-md overflow-hidden">
                        <SandboxedEmail html={expandedDetail.bodyHtml} className="rounded-md" />
                      </div>
                    ) : expandedDetail.bodyText ? (
                      <pre className="text-sm bg-muted/30 rounded-md p-4 whitespace-pre-wrap overflow-auto max-h-96">
                        {expandedDetail.bodyText}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground italic p-4">(no content)</p>
                    )}

                    {/* Inbound attachments (fresh signed URLs fetched on expand) */}
                    {email.direction === 'inbound' && email.hasAttachments && (
                      <EmailAttachments emailId={email.id} />
                    )}

                    {/* AI Draft */}
                    {expandedDetail?.aiDraftText && email.direction === 'inbound' && !email.aiAutoSent && email.status !== 'replied' && (
                      <div className="mt-4 border border-purple-200 bg-purple-50/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Bot className="h-4 w-4 text-purple-600" />
                          <span className="text-sm font-medium text-purple-800">AI Draft Reply</span>
                          <span className="text-xs text-purple-500">
                            {expandedDetail.aiDraftedAt && `Generated ${new Date(expandedDetail.aiDraftedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                          </span>
                        </div>
                        <pre className="text-sm whitespace-pre-wrap text-foreground mb-3">{expandedDetail.aiDraftText}</pre>
                        <div className="flex gap-2">
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
                            onClick={() => {
                              setReplyingTo(email.id);
                              setReplyBody(expandedDetail.aiDraftText || '');
                            }}
                          >
                            Edit & Send
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Auto-sent indicator */}
                    {email.aiAutoSent && email.direction === 'inbound' && (
                      <div className="mt-4 flex items-center gap-2 text-xs text-purple-600">
                        <Bot className="h-3.5 w-3.5" />
                        AI auto-replied to this email
                        {email.aiCategory && <span>({categoryLabels[email.aiCategory] || email.aiCategory})</span>}
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="mt-4 flex items-center gap-2">
                      {/* Reply (inbox/spam only) — quoting needs the full body loaded */}
                      {(tab === 'inbox' || tab === 'spam') && expandedDetail && (
                        <>
                          {replyingTo === email.id ? (
                            <div className="w-full space-y-3 border-t pt-3">
                              <p className="text-xs text-muted-foreground">
                                Replying to {email.fromName || email.fromEmail}
                              </p>
                              <Textarea
                                placeholder="Write your reply..."
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                rows={5}
                                autoFocus
                              />
                              <QuotedOriginal email={email} detail={expandedDetail} />
                              {replyAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {replyAttachments.map((a, i) => (
                                    <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 text-xs">
                                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                                      <span className="max-w-[150px] truncate">{a.filename}</span>
                                      <button onClick={() => setReplyAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleReply(email, expandedDetail)}
                                  disabled={sendingId === `reply-${email.id}`}
                                  className="bg-champagne text-charcoal hover:bg-champagne/90"
                                >
                                  <Send className="h-3.5 w-3.5 mr-2" />
                                  {sendingId === `reply-${email.id}` ? 'Sending...' : 'Send Reply'}
                                </Button>
                                <label className="cursor-pointer">
                                  <input type="file" multiple className="hidden" onChange={(e) => readFilesInto(e, setReplyAttachments)} />
                                  <Button size="sm" variant="outline" type="button" asChild>
                                    <span>
                                      <Paperclip className="h-3.5 w-3.5 mr-1" />
                                      Attach
                                    </span>
                                  </Button>
                                </label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReplyingTo(null);
                                    setReplyBody('');
                                    setReplyAttachments([]);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReplyingTo(email.id)}
                            >
                              <Reply className="h-3.5 w-3.5 mr-2" />
                              Reply
                            </Button>
                          )}
                        </>
                      )}

                      {/* Thread button */}
                      {replyingTo !== email.id && email.threadId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openThread(email.threadId!)}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-2" />
                          View Thread
                        </Button>
                      )}

                      {/* Delete button */}
                      {replyingTo !== email.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 ml-auto"
                          onClick={() => deleteEmail(email.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
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
    </div>
  );
}
