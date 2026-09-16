import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { eq, desc, and, or, ilike, sql, inArray, isNull, isNotNull, ne, notInArray } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { containsPattern } from '@/lib/db/like';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

const EMAIL_STATUSES = ['received', 'read', 'replied', 'sent', 'delivered', 'bounced'] as const;
const EMAIL_FILTERS = ['all', 'unread', 'needs_review', 'archived'] as const;

const FROM_EMAIL = 'notifications@mayells.com';
const FROM_ADDRESS = `Mayells <${FROM_EMAIL}>`;

const emailSendSchema = z.object({
  to: z.string().email('Valid recipient email required').max(320),
  subject: z.string().min(1).max(500),
  html: z.string().max(500_000).optional(),
  text: z.string().max(100_000).optional(),
  inReplyToId: z.string().uuid().optional(),
  attachments: z.array(z.object({
    content: z.string().max(10_000_000), // base64, ~7.5MB decoded
    filename: z.string().max(255),
    contentType: z.string().max(100).optional(),
  })).max(5).optional(),
}).refine(d => d.html || d.text, { message: 'html or text body is required' });

const emailPatchSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  status: z.enum(EMAIL_STATUSES).optional(),
  /** true = mark read, false = mark unread */
  read: z.boolean().optional(),
  /** true = archive, false = unarchive */
  archived: z.boolean().optional(),
})
  .refine(d => d.id || (d.ids && d.ids.length > 0), { message: 'id or ids required' })
  .refine(d => d.status !== undefined || d.read !== undefined || d.archived !== undefined, {
    message: 'status, read, or archived is required',
  });

const emailDeleteSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
}).refine(d => d.id || (d.ids && d.ids.length > 0), { message: 'id or ids required' });

const listQuerySchema = z.object({
  direction: z.enum(['inbound', 'outbound']).optional(),
  spam: z.enum(['true', 'false']).optional(),
  filter: z.enum(EMAIL_FILTERS).optional(),
  category: z.string().max(100).regex(/^[a-z_]+$/).optional(),
  search: z.string().max(200).optional(),
  thread_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const PAGE_SIZE = 30;

// Slim header projection for the inbox list and thread views. Full bodies, AI
// drafts, and attachment metadata can be multi-MB per page — the UI fetches
// them on demand from GET /api/admin/emails/[id] when a row is expanded.
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
  readAt: emails.readAt,
  archivedAt: emails.archivedAt,
  createdAt: emails.createdAt,
  preview: sql<string>`left(coalesce(${emails.bodyText}, ''), 200)`,
  // CASE guards jsonb_array_length so a null or non-array value can't throw
  hasAttachments: sql<boolean>`coalesce(case when jsonb_typeof(${emails.attachments}) = 'array' then jsonb_array_length(${emails.attachments}) > 0 end, false)`,
  // "Answered" is derived from the thread, never written onto the row: an
  // outbound email counts as answered when the customer replied to it; an
  // inbound one when we replied. (Statuses on outbound rows stay delivery-only.)
  hasResponse: sql<boolean>`exists (select 1 from ${emails} r where r.in_reply_to_id = ${emails.id} and r.direction <> ${emails.direction})`,
};

const unreadCondition = and(
  eq(emails.direction, 'inbound'),
  isNull(emails.readAt),
  eq(emails.isSpam, false),
  isNull(emails.archivedAt),
);

// GET /api/admin/emails?direction=inbound|outbound&search=...&page=1&spam=true|false&thread_id=...&filter=...&category=...
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const parsedQuery = listQuerySchema.safeParse({
      direction: sp.get('direction') || undefined,
      spam: sp.get('spam') || undefined,
      filter: sp.get('filter') || undefined,
      category: sp.get('category') || undefined,
      search: sp.get('search')?.trim() || undefined,
      thread_id: sp.get('thread_id') || undefined,
      page: sp.get('page') || undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0].message }, { status: 400 });
    }
    const { direction, spam: spamParam, filter, category, search, thread_id: threadId, page } = parsedQuery.data;
    const offset = (page - 1) * PAGE_SIZE;

    // Thread view: every email in a conversation, archived ones included
    if (threadId) {
      const threadEmails = await db
        .select(listColumns)
        .from(emails)
        .where(or(eq(emails.id, threadId), eq(emails.threadId, threadId)))
        .orderBy(emails.createdAt);

      return NextResponse.json({ data: threadEmails, thread: true });
    }

    const conditions = [];
    if (direction) conditions.push(eq(emails.direction, direction));
    if (spamParam === 'true') {
      conditions.push(eq(emails.isSpam, true));
    } else if (spamParam === 'false') {
      conditions.push(eq(emails.isSpam, false));
    }

    // Archived messages are hidden everywhere except under their own filter
    if (filter === 'archived') {
      conditions.push(isNotNull(emails.archivedAt));
    } else {
      conditions.push(isNull(emails.archivedAt));
    }
    if (filter === 'unread') {
      conditions.push(eq(emails.direction, 'inbound'), isNull(emails.readAt));
    } else if (filter === 'needs_review') {
      // Auto-sent replies the operator hasn't looked at, plus AI drafts that
      // were never sent or dismissed.
      conditions.push(
        or(
          eq(emails.aiAutoSent, true),
          and(isNotNull(emails.aiDraftedAt), ne(emails.status, 'replied')),
        )!,
      );
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
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [data, countResult, unreadResult, categoryRows] = await Promise.all([
      db
        .select(listColumns)
        .from(emails)
        .where(whereClause)
        .orderBy(desc(emails.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emails)
        .where(whereClause),
      // Global unread (not page-scoped): what the inbox tab badge shows.
      // Unread = inbound AND never opened — an auto-replied email still counts.
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emails)
        .where(unreadCondition),
      // Which AI categories exist in the (non-archived, non-spam) inbox, for
      // the filter chips.
      db
        .select({ category: emails.aiCategory, count: sql<number>`count(*)::int` })
        .from(emails)
        .where(and(
          eq(emails.direction, 'inbound'),
          eq(emails.isSpam, false),
          isNull(emails.archivedAt),
          isNotNull(emails.aiCategory),
        ))
        .groupBy(emails.aiCategory)
        .orderBy(desc(sql`count(*)`)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json({
      data,
      unread: unreadResult[0]?.count ?? 0,
      categories: categoryRows.filter((c) => c.category).map((c) => ({ category: c.category!, count: c.count })),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
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

    const { to, subject, html, text, inReplyToId, attachments } = parsedSend.data;

    if (isSentinelEmail(to)) {
      return NextResponse.json({ error: 'This account has no email on file' }, { status: 422 });
    }

    // Resolve the parent first so the outgoing message can carry threading
    // headers and a Reply-To that matches the address the customer wrote to.
    let parent: typeof emails.$inferSelect | undefined;
    if (inReplyToId) {
      [parent] = await db.select().from(emails).where(eq(emails.id, inReplyToId)).limit(1);
      if (!parent) {
        return NextResponse.json({ error: 'The message you are replying to no longer exists' }, { status: 404 });
      }
    }
    const parentMessageId = parent?.messageId || null;
    const replyTo = parent
      ? (parent.direction === 'inbound' ? parent.toEmail : parent.fromEmail) || BUSINESS.email
      : BUSINESS.email;

    const resend = getResend();
    const sendPayload = {
      from: FROM_ADDRESS,
      to,
      replyTo,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(parentMessageId
        ? { headers: { 'In-Reply-To': parentMessageId, References: parentMessageId } }
        : {}),
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map(a => ({
              content: Buffer.from(a.content, 'base64'),
              filename: a.filename,
              ...(a.contentType && { contentType: a.contentType }),
            })),
          }
        : {}),
    } as Parameters<typeof resend.emails.send>[0];

    const { data: sent, error: sendError } = await resend.emails.send(sendPayload);

    if (sendError) {
      logger.error('Resend send error', sendError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    let threadId: string | null = null;
    if (parent) {
      threadId = parent.threadId || parent.id;
      const parentUpdates: Record<string, unknown> = {};
      // First reply in a conversation: stamp the thread root with its own
      // threadId so the inbox shows the conversation button on it.
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
      resendId: sent?.id || null,
      direction: 'outbound',
      status: 'sent',
      fromEmail: FROM_EMAIL,
      fromName: 'Mayells',
      toEmail: to,
      toName: parent?.direction === 'inbound' ? parent.fromName : null,
      subject,
      bodyHtml: html || null,
      bodyText: text || null,
      inReplyToId: inReplyToId || null,
      inReplyToMessageId: parentMessageId,
      threadId,
      userId: parent?.userId ?? null,
    }).returning();

    return NextResponse.json({ data: saved });
  } catch (error) {
    logger.error('Admin email send error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/emails — status / read / archived (single or bulk)
export async function PATCH(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsedPatch = emailPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsedPatch.success) {
      return NextResponse.json({ error: parsedPatch.error.issues[0].message }, { status: 400 });
    }

    const { id, ids, status, read, archived } = parsedPatch.data;
    const targetIds = ids && ids.length > 0 ? ids : [id!];
    const now = new Date();

    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status === 'read') updates.readAt = now;
      if (status === 'replied') updates.repliedAt = now;
    }
    if (archived !== undefined) updates.archivedAt = archived ? now : null;

    if (read === true) {
      // Never downgrade "replied" to "read" — only the unopened status moves.
      updates.readAt = now;
      if (!status) updates.status = sql`case when ${emails.status} = 'received' then 'read'::email_status else ${emails.status} end`;
    } else if (read === false) {
      updates.readAt = null;
      if (!status) updates.status = sql`case when ${emails.status} = 'read' then 'received'::email_status else ${emails.status} end`;
    }

    await db.update(emails).set(updates).where(inArray(emails.id, targetIds));
    return NextResponse.json({ success: true, updated: targetIds.length });
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

    const { id, ids } = parsedDelete.data;
    const idsToDelete: string[] = ids && ids.length > 0 ? ids : id ? [id] : [];
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
