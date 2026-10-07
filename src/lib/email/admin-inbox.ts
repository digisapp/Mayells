import { randomUUID } from 'crypto';
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { emails, type Email } from '@/db/schema';
import { getResend } from './resend';
import { escapeHtml } from './escape';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import { formatShortDate } from '@/lib/format/dates';
import { logger } from '@/lib/logger';
import {
  ADMIN_FROM_NAME,
  getAdminFrom,
  getAdminFromAddress,
  isValidEmail,
  threadReplyAddress,
} from './addresses';

/**
 * The admin inbox's send path and folder maths. One place for every email a
 * human (or the AI, on a human's behalf) sends from /admin/emails, so the
 * From, the per-thread Reply-To, the threading headers and the stored row
 * are the same whether it is a compose, a reply, an AI draft or the
 * round-trip test.
 *
 * Threading: every send carries Reply-To `info+<threadId>@mayells.com`
 * (see addresses.ts). The thread id is the root email's id — the first
 * message of a conversation has threadId = its own id — so a brand-new
 * email mints its id up front and tags it before anything is sent.
 */

export const SYSTEM_CATEGORY = 'system';
export const TEST_SUMMARY = 'Round-trip test sent from the inbox. Reply to it to prove receiving works.';

/** Plain-text body → the Georgia-serif wrapper every manual reply uses. */
export function textToHtml(text: string): string {
  return `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${escapeHtml(text).replace(/\n/g, '<br />')}</div>`;
}

/** The customer's message, quoted under a reply (HTML). */
export function quotedHtml(original: Pick<Email, 'createdAt' | 'fromName' | 'fromEmail' | 'bodyHtml' | 'bodyText'>): string {
  // Never put the customer's raw HTML into mail we send: it may carry
  // tracking pixels, hidden text or markup that breaks our own layout. Quote
  // their words as escaped text (falling back to the HTML stripped to text).
  const quoted = escapeHtml(original.bodyText || htmlToPlainText(original.bodyHtml)).replace(/\n/g, '<br />');
  if (!quoted) return '';
  return `
    <br /><br />
    <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666; font-size: 13px;">
      <p style="margin: 0 0 4px;">On ${formatShortDate(original.createdAt)}, ${escapeHtml(original.fromName || original.fromEmail)} wrote:</p>
      <div>${quoted}</div>
    </div>`;
}

/** Rough HTML → text for quoting when a message arrived without a text part. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The customer's message, quoted under a reply (plain text). */
export function quotedText(original: Pick<Email, 'createdAt' | 'fromName' | 'fromEmail' | 'bodyText'>): string {
  if (!original.bodyText) return '';
  return `\n\n> On ${formatShortDate(original.createdAt)}, ${original.fromName || original.fromEmail} wrote:\n> ${original.bodyText.split('\n').join('\n> ')}`;
}

export function replySubject(subject: string | null | undefined): string {
  return `Re: ${(subject || '').replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '')}`;
}

export interface OutgoingAttachment {
  /** Base64 content, or a Resend-hosted URL (`path`) it fetches at send time. */
  content?: string | Buffer;
  path?: string;
  filename: string;
  contentType?: string;
}

export interface SendAdminEmailParams {
  to: string;
  subject: string;
  /** The operator's (or AI's) words, plain text, without the quote. */
  text: string;
  /**
   * Full HTML to send instead of the plain wrapper (+ quote). The AI draft
   * path passes its branded template here.
   */
  html?: string;
  /** Reply to this stored email: threads it, quotes it, marks it replied. */
  inReplyToId?: string | null;
  /** Append the original message under a reply (default true). */
  quoteOriginal?: boolean;
  attachments?: OutgoingAttachment[];
  /**
   * Resend idempotency key from the client (one per composed message), so a
   * double click or a retried request delivers once. Defaults to the new
   * row's id, which only guards against retries inside Resend.
   */
  idempotencyKey?: string;
  /** Row fields for the stored outbound copy (AI sends stamp their category). */
  rowExtras?: Partial<Pick<Email, 'aiAutoSent' | 'aiCategory' | 'aiSummary' | 'userId'>>;
}

export type SendAdminEmailResult =
  | { ok: true; email: Email; threadId: string; parent: Email | null }
  | { ok: false; status: number; error: string };

export async function sendAdminEmail(params: SendAdminEmailParams): Promise<SendAdminEmailResult> {
  const to = params.to.trim().toLowerCase();
  if (!isValidEmail(to)) return { ok: false, status: 400, error: 'Enter a valid email address' };
  if (isSentinelEmail(to)) return { ok: false, status: 422, error: 'This account has no email on file' };
  const subject = params.subject.trim();
  if (!subject) return { ok: false, status: 400, error: 'Subject is required' };
  const text = params.text.replace(/\s+$/, '');
  if (!text.trim() && !params.html) return { ok: false, status: 400, error: 'Write a message first' };

  // Resolve the parent first so the outgoing message can carry threading
  // headers and the per-thread Reply-To.
  let parent: Email | null = null;
  if (params.inReplyToId) {
    [parent = null] = await db.select().from(emails).where(eq(emails.id, params.inReplyToId)).limit(1);
    if (!parent) return { ok: false, status: 404, error: 'The message you are replying to no longer exists' };
  }

  const newId = randomUUID();
  const threadId = parent ? (parent.threadId || parent.id) : newId;
  const quoted = parent && params.quoteOriginal !== false ? parent : null;
  const html = params.html ?? `${textToHtml(text)}${quoted ? quotedHtml(quoted) : ''}`;
  const fullText = `${text}${quoted ? quotedText(quoted) : ''}`;

  // In-Reply-To / References make the recipient's client group the reply;
  // the References chain carries the message the parent itself answered.
  const headers: Record<string, string> = {};
  if (parent?.messageId) {
    headers['In-Reply-To'] = parent.messageId;
    headers.References = [parent.inReplyToMessageId, parent.messageId].filter(Boolean).join(' ');
  }

  const resend = getResend();
  const payload = {
    from: getAdminFrom(),
    to,
    replyTo: threadReplyAddress(threadId),
    subject,
    html,
    text: fullText,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(params.attachments && params.attachments.length > 0
      ? {
          attachments: params.attachments.map((a) => ({
            filename: a.filename,
            ...(a.path ? { path: a.path } : {}),
            ...(a.content !== undefined
              ? { content: typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : a.content }
              : {}),
            ...(a.contentType ? { contentType: a.contentType } : {}),
          })),
        }
      : {}),
  } as Parameters<typeof resend.emails.send>[0];

  // A retried request (double click, flaky network) delivers once.
  const { data: sent, error: sendError } = await resend.emails.send(payload, {
    idempotencyKey: `admin-inbox/${params.idempotencyKey || newId}`,
  });
  if (sendError) {
    logger.error('Resend send error', sendError, { to, subject });
    return { ok: false, status: 502, error: 'Failed to send — Resend rejected the message.' };
  }

  if (parent) {
    const parentUpdates: Record<string, unknown> = {};
    // First reply in a conversation: stamp the thread root with its own id
    // so the inbox shows the conversation on it.
    if (!parent.threadId) parentUpdates.threadId = parent.id;
    if (parent.direction === 'inbound') {
      if (parent.status !== 'replied') {
        parentUpdates.status = 'replied';
        parentUpdates.repliedAt = new Date();
      }
      if (!parent.readAt) parentUpdates.readAt = new Date();
    }
    if (Object.keys(parentUpdates).length > 0) {
      await db.update(emails).set(parentUpdates).where(eq(emails.id, parent.id));
    }
  }

  const [saved] = await db.insert(emails).values({
    id: newId,
    resendId: sent?.id || null,
    direction: 'outbound',
    status: 'sent',
    fromEmail: getAdminFromAddress(),
    fromName: ADMIN_FROM_NAME,
    toEmail: to,
    toName: parent?.direction === 'inbound' ? parent.fromName : null,
    subject,
    bodyHtml: html,
    bodyText: fullText,
    inReplyToId: parent?.id ?? null,
    inReplyToMessageId: parent?.messageId ?? null,
    threadId,
    userId: parent?.userId ?? null,
    ...params.rowExtras,
  }).returning();

  return { ok: true, email: saved, threadId, parent };
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export const INBOX_FOLDERS = ['inbox', 'unread', 'needs_review', 'starred', 'sent', 'spam', 'archived'] as const;
export type InboxFolder = (typeof INBOX_FOLDERS)[number];

export function isInboxFolder(v: unknown): v is InboxFolder {
  return typeof v === 'string' && (INBOX_FOLDERS as readonly string[]).includes(v);
}

const live = isNull(emails.archivedAt);
const inboundLive = and(eq(emails.direction, 'inbound'), eq(emails.isSpam, false), live);

/**
 * The conversation a row belongs to. A thread root carries its own id in
 * thread_id once it has a reply (sendAdminEmail stamps it) and null before,
 * so the key is coalesce(thread_id, id) — the same key the inbox list groups
 * by and the thread view loads by.
 */
export const threadKey = sql<string>`coalesce(${emails.threadId}, ${emails.id})`;

/** Auto-sent replies not yet looked at, plus AI drafts never sent. */
export const needsReviewCondition = and(
  inboundLive,
  or(
    and(eq(emails.aiAutoSent, true), isNull(emails.readAt)),
    and(isNotNull(emails.aiDraftedAt), ne(emails.status, 'replied')),
  ),
);

export const unreadCondition = and(inboundLive, isNull(emails.readAt));

/** The WHERE clause of each folder; a folder is the whole list, not a filter on another. */
export function folderCondition(folder: InboxFolder) {
  switch (folder) {
    case 'inbox':
      return inboundLive;
    case 'unread':
      return unreadCondition;
    case 'needs_review':
      return needsReviewCondition;
    case 'starred':
      return and(eq(emails.isStarred, true), live);
    case 'sent':
      return and(eq(emails.direction, 'outbound'), live);
    case 'spam':
      return and(eq(emails.direction, 'inbound'), eq(emails.isSpam, true), live);
    case 'archived':
      return isNotNull(emails.archivedAt);
  }
}

export interface FolderCounts {
  unread: number;
  needsReview: number;
  starred: number;
  spam: number;
  archived: number;
}

/**
 * Badge numbers for the folder chips, in one query. The inbox lists
 * conversations, so these count conversations too: three unread replies in
 * one thread are one unread conversation, the same as the row they make.
 */
export async function getFolderCounts(): Promise<FolderCounts> {
  const [row] = await db
    .select({
      unread: sql<number>`count(distinct ${threadKey}) filter (where ${unreadCondition})::int`,
      needsReview: sql<number>`count(distinct ${threadKey}) filter (where ${needsReviewCondition})::int`,
      starred: sql<number>`count(distinct ${threadKey}) filter (where ${folderCondition('starred')})::int`,
      spam: sql<number>`count(distinct ${threadKey}) filter (where ${folderCondition('spam')})::int`,
      archived: sql<number>`count(distinct ${threadKey}) filter (where ${folderCondition('archived')})::int`,
    })
    .from(emails);
  return {
    unread: row?.unread ?? 0,
    needsReview: row?.needsReview ?? 0,
    starred: row?.starred ?? 0,
    spam: row?.spam ?? 0,
    archived: row?.archived ?? 0,
  };
}
