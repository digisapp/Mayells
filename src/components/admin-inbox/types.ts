import type { InboxStatus } from '@/lib/email/inbox-status';

export type { InboxStatus };

export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'received' | 'read' | 'replied' | 'sent' | 'delivered' | 'bounced';
export type InboxFolder = 'inbox' | 'unread' | 'needs_review' | 'starred' | 'sent' | 'spam' | 'archived';
export type BulkAction = 'markRead' | 'markUnread' | 'star' | 'unstar' | 'spam' | 'notSpam' | 'archive' | 'unarchive' | 'delete';

/** Slim header row from the list/thread endpoints — bodies load on demand. */
export interface EmailRow {
  id: string;
  direction: EmailDirection;
  status: EmailStatus | string;
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
  isSpam: boolean;
  isStarred: boolean;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  preview: string;
  hasAttachments: boolean;
  /** Derived from the thread: the other side has replied to this message. */
  hasResponse: boolean;
  threadCount: number;
  /** Unread messages anywhere in this row's conversation. */
  threadUnread: number;
}

/** Summary of the seller prospect behind a conversation, for the lead card. */
export interface ProspectSummary {
  id: string;
  fullName: string;
  phone: string | null;
  status: string;
  itemSummary: string | null;
  estimatedItemCount: number | null;
  city: string | null;
  site: string | null;
}

export interface EmailLinks {
  userId: string | null;
  prospectId: string | null;
  outreachId: string | null;
}

/** Heavy fields of the full email row, fetched per email on open. */
export interface EmailDetail {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  aiDraftText: string | null;
  aiDraftedAt: string | null;
  links: EmailLinks;
  prospect: ProspectSummary | null;
}

export interface AttachmentLink {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  downloadUrl: string;
}

export interface OutgoingAttachment {
  content: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FolderCounts {
  unread: number;
  needsReview: number;
  starred: number;
  spam: number;
  archived: number;
}

export const EMPTY_COUNTS: FolderCounts = { unread: 0, needsReview: 0, starred: 0, spam: 0, archived: 0 };

export const FOLDERS: ReadonlyArray<{ value: InboxFolder; label: string; count?: keyof FolderCounts }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'unread', label: 'Unread', count: 'unread' },
  { value: 'needs_review', label: 'Needs review', count: 'needsReview' },
  { value: 'starred', label: 'Starred', count: 'starred' },
  { value: 'sent', label: 'Sent' },
  { value: 'spam', label: 'Spam', count: 'spam' },
  { value: 'archived', label: 'Archived', count: 'archived' },
];

export const CATEGORY_LABELS: Record<string, string> = {
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

export const AUTO_REPLY_CATEGORY_LABELS = [
  'Appraisal requests',
  'Consignment inquiries',
  'Purchase inquiries',
  'Auction questions',
  'Estate evaluations',
  'Scheduling',
  'General inquiries',
];

export const EMPTY_COPY: Record<InboxFolder, { title: string; body: string }> = {
  inbox: { title: 'No incoming emails yet', body: 'Mail sent to the Mayells inbox address shows up here.' },
  unread: { title: 'All caught up', body: 'No unread mail.' },
  needs_review: {
    title: 'Nothing needs review',
    body: 'Needs review lists emails the AI replied to automatically and emails with an AI draft that has not been sent yet.',
  },
  starred: { title: 'Nothing starred', body: 'Star an email to keep it handy.' },
  sent: { title: 'Nothing sent yet', body: 'Replies and new emails you send appear here.' },
  spam: { title: 'No spam', body: 'Mail flagged as spam lands here instead of the inbox.' },
  archived: { title: 'Nothing archived', body: 'Archived mail leaves the inbox but stays in its conversation.' },
};

export const SIGNATURE = 'MAYELLS · Palm Beach · info@mayells.com';
/** How a typed reply signs off; the AI drafts sign the same way. */
export const REPLY_CLOSING = 'Warm regards,\nThe Mayells Team';

// Vercel rejects request bodies over 4.5 MB; base64 adds a third, so cap the
// raw attachment bytes well below that.
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function isUnread(email: Pick<EmailRow, 'direction' | 'readAt'>): boolean {
  return email.direction === 'inbound' && !email.readAt;
}

/** A list row stands for its conversation: unread while any message in it is. */
export function conversationUnread(row: Pick<EmailRow, 'threadUnread'>): boolean {
  return row.threadUnread > 0;
}

/** The conversation key a row belongs to (the server groups by the same). */
export function threadKeyOf(row: Pick<EmailRow, 'id' | 'threadId'>): string {
  return row.threadId || row.id;
}

/** "Jane" from "Jane Doe", "jane.doe@x" or "Doe, Jane"; null when there is nothing usable. */
export function firstNameOf(name: string | null | undefined): string | null {
  const raw = (name || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const local = raw.split('@')[0].split(/[._-]/)[0];
    return /^[a-z]{2,}$/i.test(local) ? local[0].toUpperCase() + local.slice(1).toLowerCase() : null;
  }
  const commaSplit = raw.split(',');
  const first = (commaSplit.length === 2 ? commaSplit[1] : raw).trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '');
  return first.length >= 2 ? first : null;
}

/**
 * A reply starts already greeted and signed, with room between for the
 * operator's words (the composer puts the caret there).
 */
export function replyStarter(name: string | null | undefined): { body: string; caretAt: number } {
  const first = firstNameOf(name);
  const greeting = first ? `Hi ${first},` : 'Hello,';
  const body = `${greeting}\n\n\n\n${REPLY_CLOSING}`;
  return { body, caretAt: greeting.length + 2 };
}

export function replySubject(subject: string | null): string {
  return `Re: ${(subject || '').replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '')}`;
}

export function forwardSubject(subject: string | null): string {
  const s = (subject || '').trim();
  return /^fwd?\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

export function fillTemplate(body: string, name: string | null | undefined): string {
  return body.replace(/{contactName}/g, name || 'there').replace(/{companyName}/g, '');
}

export function appendSignature(body: string): string {
  const trimmed = body.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n\n' : ''}${SIGNATURE}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Display name for a counterpart: name if we have one, else the address. */
export function counterpart(e: Pick<EmailRow, 'direction' | 'fromEmail' | 'fromName' | 'toEmail' | 'toName'>) {
  return e.direction === 'inbound'
    ? { name: e.fromName || e.fromEmail, address: e.fromEmail }
    : { name: e.toName || e.toEmail, address: e.toEmail };
}

/**
 * Plain-text rendering of an HTML body, for quoting in a forward. DOMParser
 * builds an inert document: nothing runs, nothing is fetched.
 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, head, title').forEach((n) => n.remove());
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table').forEach((n) => n.append('\n'));
  return (doc.body?.textContent || '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * An outbound thread member is a forward (not a reply) when it went somewhere
 * other than the counterparty of the message it hangs off. Nothing on the row
 * says so; the "Fwd:" subject is the fallback when the recipient was the same.
 */
export function isForwardOf(row: EmailRow, parent: EmailRow | undefined): boolean {
  if (row.direction !== 'outbound' || !row.inReplyToId) return false;
  if (/^\s*fwd?\s*:/i.test(row.subject || '')) return true;
  if (!parent) return false;
  const counterpartyAddress = parent.direction === 'inbound' ? parent.fromEmail : parent.toEmail;
  return counterpartyAddress.toLowerCase() !== row.toEmail.toLowerCase();
}

/**
 * Where a plain-text reply starts quoting the message it answers: an
 * "On …, X wrote:" line or the first "> " line. The thread above already
 * shows that message, so the quote folds behind a toggle.
 */
export function splitQuotedText(text: string): { own: string; quoted: string | null } {
  const lines = text.split('\n');
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^>/.test(line) || /^(on .{6,120} wrote:|-{2,}\s*original message\s*-{2,}|from:\s.+)$/i.test(line)) { cut = i; break; }
  }
  if (cut <= 0) return { own: text, quoted: null };
  const own = lines.slice(0, cut).join('\n').replace(/\s+$/, '');
  if (!own.trim()) return { own: text, quoted: null };
  return { own, quoted: lines.slice(cut).join('\n').trim() || null };
}

/** Extract an error message without assuming the body is JSON (413s, proxy errors…). */
export async function readError(res: Response, fallback: string): Promise<string> {
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
