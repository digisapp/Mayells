import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { eq, desc, and, or, ilike, sql, inArray, isNull, isNotNull, notInArray } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { containsPattern } from '@/lib/db/like';
import {
  folderCondition,
  getFolderCounts,
  isInboxFolder,
  sendAdminEmail,
  threadKey,
  unreadCondition,
  type InboxFolder,
} from '@/lib/email/admin-inbox';
import { logger } from '@/lib/logger';

const EMAIL_STATUSES = ['received', 'read', 'replied', 'sent', 'delivered', 'bounced'] as const;
const EMAIL_FILTERS = ['all', 'unread', 'needs_review', 'archived'] as const;

const emailSendSchema = z.object({
  to: z.string().email('Valid recipient email required').max(320),
  subject: z.string().min(1).max(500),
  /** The message, plain text. The server wraps it and quotes the original. */
  text: z.string().max(100_000).optional(),
  /** Full HTML override (older clients composed their own). */
  html: z.string().max(500_000).optional(),
  inReplyToId: z.string().uuid().optional(),
  /** Quote the message being replied to under this one (default true). */
  quoteOriginal: z.boolean().optional(),
  /** Lets a retried request (double click) deliver once. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  attachments: z.array(z.object({
    content: z.string().max(10_000_000), // base64, ~7.5MB decoded
    filename: z.string().max(255),
    contentType: z.string().max(100).optional(),
  })).max(5).optional(),
}).refine(d => (d.text && d.text.trim()) || d.html, { message: 'Write a message first' });

const emailPatchSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  /** Whole conversations (thread keys): every message in each of them. */
  threadIds: z.array(z.string().uuid()).max(500).optional(),
  status: z.enum(EMAIL_STATUSES).optional(),
  /** true = mark read, false = mark unread */
  read: z.boolean().optional(),
  /** true = archive, false = unarchive */
  archived: z.boolean().optional(),
  /** true = star, false = unstar */
  starred: z.boolean().optional(),
  /** true = spam, false = not spam (inbound only) */
  spam: z.boolean().optional(),
})
  .refine(d => d.id || (d.ids && d.ids.length > 0) || (d.threadIds && d.threadIds.length > 0), { message: 'id, ids or threadIds required' })
  .refine(d => [d.status, d.read, d.archived, d.starred, d.spam].some((v) => v !== undefined), {
    message: 'status, read, archived, starred, or spam is required',
  });

const emailDeleteSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  /** Whole conversations (thread keys): every message in each of them. */
  threadIds: z.array(z.string().uuid()).max(500).optional(),
}).refine(d => d.id || (d.ids && d.ids.length > 0) || (d.threadIds && d.threadIds.length > 0), { message: 'id, ids or threadIds required' });

const listQuerySchema = z.object({
  /** Inbox folder (the admin inbox). Takes precedence over direction/spam/filter. */
  folder: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  spam: z.enum(['true', 'false']).optional(),
  filter: z.enum(EMAIL_FILTERS).optional(),
  category: z.string().max(100).regex(/^[a-z_]+$/).optional(),
  search: z.string().max(200).optional(),
  thread_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const PAGE_SIZE = 30;

// Slim header projection for the inbox list and thread views. Full bodies, AI
// drafts, and attachment metadata can be multi-MB per page — the UI fetches
// them on demand from GET /api/admin/emails/[id] when a row is opened.
const listColumns = {
  id: emails.id,
  direction: emails.direction,
  status: emails.status,
  fromEmail: emails.fromEmail,
  fromName: emails.fromName,
  toEmail: emails.toEmail,
  toName: emails.toName,
  subject: emails.subject,
  inReplyToId: emails.inReplyToId,
  threadId: emails.threadId,
  userId: emails.userId,
  aiAutoSent: emails.aiAutoSent,
  aiCategory: emails.aiCategory,
  aiConfidence: emails.aiConfidence,
  aiSummary: emails.aiSummary,
  aiDraftedAt: emails.aiDraftedAt,
  isSpam: emails.isSpam,
  isStarred: emails.isStarred,
  readAt: emails.readAt,
  archivedAt: emails.archivedAt,
  createdAt: emails.createdAt,
  // Our own notifications (and some senders) arrive HTML-only: strip the
  // markup so the row still shows what the email says.
  preview: sql<string>`left(regexp_replace(regexp_replace(regexp_replace(coalesce(nullif(${emails.bodyText}, ''), ${emails.bodyHtml}, ''), '<(style|script|head)[^>]*>.*?</\\1>', ' ', 'gi'), '<[^>]+>|&nbsp;', ' ', 'g'), '\\s+', ' ', 'g'), 200)`,
  // CASE guards jsonb_array_length so a null or non-array value can't throw
  hasAttachments: sql<boolean>`coalesce(case when jsonb_typeof(${emails.attachments}) = 'array' then jsonb_array_length(${emails.attachments}) > 0 end, false)`,
  // "Answered" is derived from the thread, never written onto the row: an
  // outbound email counts as answered when the customer replied to it; an
  // inbound one when we replied. (Statuses on outbound rows stay delivery-only.)
  // Outer columns written literally as "emails".…: interpolated ones render
  // bare ("id", "direction"), which inside the subquery resolve to r's own
  // columns, so the check could never be true.
  hasResponse: sql<boolean>`exists (select 1 from ${emails} r where r.in_reply_to_id = "emails"."id" and r.direction <> "emails"."direction")`,
  // How many messages share this conversation (1 for a lone email).
  threadCount: sql<number>`(select count(*) from ${emails} t where t.thread_id = coalesce("emails"."thread_id", "emails"."id") or t.id = coalesce("emails"."thread_id", "emails"."id"))::int`,
  // Unread messages anywhere in the conversation: a list row is bold while
  // any of them is, not only when the latest one is.
  threadUnread: sql<number>`(select count(*) from ${emails} u where (u.thread_id = coalesce("emails"."thread_id", "emails"."id") or u.id = coalesce("emails"."thread_id", "emails"."id")) and u.direction = 'inbound' and u.read_at is null and u.is_spam = false and u.archived_at is null)::int`,
};

/**
 * Columns of the slim projection, aliased so they can come back out of a
 * subquery (Drizzle needs a name for every SQL expression it re-selects).
 */
const conversationColumns = Object.fromEntries(
  Object.entries(listColumns).map(([key, col]) => [key, 'as' in col && typeof col.as === 'function' && !('name' in col) ? col.as(key) : col]),
) as typeof listColumns;

/** Legacy direction/spam/filter params → the equivalent folder. */
function legacyFolder(direction?: 'inbound' | 'outbound', spam?: 'true' | 'false', filter?: (typeof EMAIL_FILTERS)[number]): InboxFolder | null {
  if (filter === 'archived') return 'archived';
  if (spam === 'true') return 'spam';
  if (direction === 'outbound') return 'sent';
  if (filter === 'unread') return 'unread';
  if (filter === 'needs_review') return 'needs_review';
  if (direction === 'inbound') return 'inbox';
  return null;
}

// GET /api/admin/emails?folder=inbox|unread|needs_review|starred|sent|spam|archived&search=...&page=1&category=...&thread_id=...
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const parsedQuery = listQuerySchema.safeParse({
      folder: sp.get('folder') || undefined,
      direction: sp.get('direction') || undefined,
      spam: sp.get('spam') || undefined,
      filter: sp.get('filter') || undefined,
      category: sp.get('category') || undefined,
      search: sp.get('search')?.trim() || undefined,
      thread_id: sp.get('thread_id') || undefined,
      page: sp.get('page') || undefined,
      limit: sp.get('limit') || undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0].message }, { status: 400 });
    }
    const { direction, spam: spamParam, filter, category, search, thread_id: threadId, page } = parsedQuery.data;
    const pageSize = parsedQuery.data.limit ?? PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    // Thread view: every email in a conversation, archived ones included
    if (threadId) {
      const threadEmails = await db
        .select(listColumns)
        .from(emails)
        .where(or(eq(emails.id, threadId), eq(emails.threadId, threadId)))
        .orderBy(emails.createdAt);

      return NextResponse.json({ data: threadEmails, thread: true });
    }

    const folder: InboxFolder | null = isInboxFolder(parsedQuery.data.folder)
      ? parsedQuery.data.folder
      : legacyFolder(direction, spamParam, filter);

    const conditions = [];
    if (folder) {
      conditions.push(folderCondition(folder));
    } else {
      // No folder at all (a search across everything): live mail only.
      if (direction) conditions.push(eq(emails.direction, direction));
      if (spamParam === 'true') conditions.push(eq(emails.isSpam, true));
      else if (spamParam === 'false') conditions.push(eq(emails.isSpam, false));
      conditions.push(isNull(emails.archivedAt));
    }
    if (category) conditions.push(eq(emails.aiCategory, category));

    if (search) {
      const pattern = containsPattern(search);
      conditions.push(
        or(
          ilike(emails.fromEmail, pattern),
          ilike(emails.fromName, pattern),
          ilike(emails.toEmail, pattern),
          ilike(emails.toName, pattern),
          ilike(emails.subject, pattern),
          ilike(emails.bodyText, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    // One row per conversation: the newest message in it that matches the
    // folder (DISTINCT ON picks it), the page ordered by that message's
    // date. Three replies in one thread are one row, as in any mail client;
    // opening the row shows the whole conversation.
    const newestPerConversation = db
      .selectDistinctOn([threadKey], conversationColumns)
      .from(emails)
      .where(whereClause)
      .orderBy(threadKey, desc(emails.createdAt))
      .as('conversation');

    const [data, countResult, unreadResult, categoryRows, counts] = await Promise.all([
      db
        .select()
        .from(newestPerConversation)
        .orderBy(desc(newestPerConversation.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(distinct ${threadKey})::int` })
        .from(emails)
        .where(whereClause),
      // Global unread (not page-scoped): what the inbox tab badge shows.
      db
        .select({ count: sql<number>`count(distinct ${threadKey})::int` })
        .from(emails)
        .where(unreadCondition),
      // Which AI categories exist in the (non-archived, non-spam) inbox, for
      // the filter chips.
      db
        .select({ category: emails.aiCategory, count: sql<number>`count(distinct ${threadKey})::int` })
        .from(emails)
        .where(and(
          eq(emails.direction, 'inbound'),
          eq(emails.isSpam, false),
          isNull(emails.archivedAt),
          isNotNull(emails.aiCategory),
        ))
        .groupBy(emails.aiCategory)
        .orderBy(desc(sql`count(distinct ${threadKey})`)),
      getFolderCounts(),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json({
      data,
      folder,
      unread: unreadResult[0]?.count ?? 0,
      counts,
      categories: categoryRows.filter((c) => c.category).map((c) => ({ category: c.category!, count: c.count })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error('Admin emails fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/emails — send a new email or reply
export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsedSend = emailSendSchema.safeParse(await req.json().catch(() => null));
    if (!parsedSend.success) {
      return NextResponse.json({ error: parsedSend.error.issues[0].message }, { status: 400 });
    }

    const { to, subject, html, text, inReplyToId, quoteOriginal, idempotencyKey, attachments } = parsedSend.data;

    const result = await sendAdminEmail({
      to,
      subject,
      text: text ?? '',
      html,
      inReplyToId,
      quoteOriginal,
      idempotencyKey,
      attachments,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    logger.info('Admin email sent', { adminId: admin.id, emailId: result.email.id, to: result.email.toEmail, inReplyToId: inReplyToId ?? null });
    return NextResponse.json({ data: result.email, threadId: result.threadId });
  } catch (error) {
    logger.error('Admin email send error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/emails — status / read / archived / starred / spam (single or bulk)
export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsedPatch = emailPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsedPatch.success) {
      return NextResponse.json({ error: parsedPatch.error.issues[0].message }, { status: 400 });
    }

    const { id, ids, threadIds, status, read, archived, starred, spam } = parsedPatch.data;
    const targetIds = ids && ids.length > 0 ? ids : id ? [id] : [];
    // Messages named directly, plus every message of each named conversation.
    const targets = or(
      ...(targetIds.length > 0 ? [inArray(emails.id, targetIds)] : []),
      ...(threadIds && threadIds.length > 0 ? [inArray(threadKey, threadIds)] : []),
    )!;
    const now = new Date();

    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status === 'read') updates.readAt = now;
      if (status === 'replied') updates.repliedAt = now;
    }
    if (archived !== undefined) updates.archivedAt = archived ? now : null;
    if (starred !== undefined) updates.isStarred = starred;

    if (read === true) {
      // Never downgrade "replied" to "read" — only the unopened status moves.
      updates.readAt = now;
      if (!status) updates.status = sql`case when ${emails.status} = 'received' then 'read'::email_status else ${emails.status} end`;
    } else if (read === false) {
      updates.readAt = null;
      if (!status) updates.status = sql`case when ${emails.status} = 'read' then 'received'::email_status else ${emails.status} end`;
    }

    let updated = 0;
    if (Object.keys(updates).length > 0) {
      // Read marks are an inbound notion too: an outbound row never has a
      // read_at, and marking one would make nothing happen either way.
      const scope = read !== undefined && !status && archived === undefined && starred === undefined
        ? and(targets, eq(emails.direction, 'inbound'))
        : targets;
      const rows = await db.update(emails).set(updates).where(scope).returning({ id: emails.id });
      updated = rows.length;
    }
    // Spam is an inbound notion; outbound rows in a bulk selection are skipped.
    if (spam !== undefined) {
      const rows = await db
        .update(emails)
        .set({ isSpam: spam })
        .where(and(targets, eq(emails.direction, 'inbound')))
        .returning({ id: emails.id });
      updated = Math.max(updated, rows.length);
    }
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    logger.error('Admin email update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/emails — delete emails (single or bulk), re-rooting any
// surviving thread members instead of orphaning them.
export async function DELETE(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsedDelete = emailDeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsedDelete.success) {
      return NextResponse.json({ error: parsedDelete.error.issues[0].message }, { status: 400 });
    }

    const { id, ids, threadIds } = parsedDelete.data;
    const named: string[] = ids && ids.length > 0 ? ids : id ? [id] : [];
    // A conversation named by its key deletes every message in it.
    const members = threadIds && threadIds.length > 0
      ? await db.select({ id: emails.id }).from(emails).where(inArray(threadKey, threadIds))
      : [];
    const idsToDelete = Array.from(new Set([...named, ...members.map((m) => m.id)]));
    if (idsToDelete.length === 0) return NextResponse.json({ success: true, deleted: 0 });
    const doomed = new Set(idsToDelete);

    await db.transaction(async (tx) => {
      const doomedRows = await tx
        .select({ id: emails.id, threadId: emails.threadId, inReplyToId: emails.inReplyToId })
        .from(emails)
        .where(inArray(emails.id, idsToDelete));
      const parentOf = new Map(doomedRows.map((r) => [r.id, r.inReplyToId]));

      // 1. Re-root threads whose root is being deleted: the oldest survivor
      //    becomes the new root and every other survivor points at it.
      const rootsBeingDeleted = await tx
        .selectDistinct({ threadId: emails.threadId })
        .from(emails)
        .where(and(inArray(emails.threadId, idsToDelete), notInArray(emails.id, idsToDelete)));

      for (const { threadId } of rootsBeingDeleted) {
        if (!threadId) continue;
        const [survivor] = await tx
          .select({ id: emails.id })
          .from(emails)
          .where(and(eq(emails.threadId, threadId), notInArray(emails.id, idsToDelete)))
          .orderBy(emails.createdAt)
          .limit(1);
        if (!survivor) continue;
        await tx
          .update(emails)
          .set({ threadId: survivor.id })
          .where(and(eq(emails.threadId, threadId), notInArray(emails.id, idsToDelete)));
        await tx.update(emails).set({ inReplyToId: null }).where(eq(emails.id, survivor.id));
      }

      // 2. Re-parent direct replies to a deleted message onto its nearest
      //    surviving ancestor (walking through other deleted ancestors), or
      //    detach them when none survives.
      for (const row of doomedRows) {
        let ancestor = row.inReplyToId;
        const seen = new Set<string>();
        while (ancestor && doomed.has(ancestor) && !seen.has(ancestor)) {
          seen.add(ancestor);
          ancestor = parentOf.get(ancestor) ?? null;
        }
        await tx
          .update(emails)
          .set({ inReplyToId: ancestor ?? null })
          .where(and(eq(emails.inReplyToId, row.id), notInArray(emails.id, idsToDelete)));
      }

      // Any remaining thread pointers at deleted ids belong to threads with no
      // survivors — nothing left to re-root, just clear them defensively.
      await tx.update(emails).set({ threadId: null }).where(inArray(emails.threadId, idsToDelete));

      await tx.delete(emails).where(inArray(emails.id, idsToDelete));
    });

    return NextResponse.json({ success: true, deleted: idsToDelete.length });
  } catch (error) {
    logger.error('Admin email delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
