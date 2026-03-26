import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq, desc, and, or, ilike, sql, inArray } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 30;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// GET /api/admin/emails?direction=inbound|outbound&search=...&page=1&spam=true|false&thread_id=...
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const direction = req.nextUrl.searchParams.get('direction');
    const search = req.nextUrl.searchParams.get('search')?.trim();
    const spamParam = req.nextUrl.searchParams.get('spam');
    const threadId = req.nextUrl.searchParams.get('thread_id');
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;

    // Thread view: fetch all emails in a conversation
    if (threadId) {
      const threadEmails = await db
        .select()
        .from(emails)
        .where(or(eq(emails.id, threadId), eq(emails.threadId, threadId)))
        .orderBy(emails.createdAt);

      return NextResponse.json({ data: threadEmails, thread: true });
    }

    // Build conditions
    const conditions = [];
    if (direction) {
      conditions.push(eq(emails.direction, direction as 'inbound' | 'outbound'));
    }
    if (spamParam === 'true') {
      conditions.push(eq(emails.isSpam, true));
    } else if (spamParam === 'false') {
      conditions.push(eq(emails.isSpam, false));
    }
    if (search) {
      const pattern = `%${search}%`;
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

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(emails)
        .where(whereClause)
        .orderBy(desc(emails.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emails)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json({
      data,
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
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { to, subject, html, text, inReplyToId, attachments } = await req.json();
    if (!to || !subject || (!html && !text)) {
      return NextResponse.json({ error: 'to, subject, and body required' }, { status: 400 });
    }

    const resend = getResend();
    const fromAddress = 'Mayell <notifications@mayells.com>';

    // Build send params with optional attachments
    // Attachments format: [{ content: "base64...", filename: "file.pdf", contentType?: "application/pdf" }]
    const sendParams: Parameters<typeof resend.emails.send>[0] = {
      from: fromAddress,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      sendParams.attachments = attachments.map((a: { content: string; filename: string; contentType?: string }) => ({
        content: Buffer.from(a.content, 'base64'),
        filename: a.filename,
        ...(a.contentType && { contentType: a.contentType }),
      }));
    }

    const { data: sent, error: sendError } = await resend.emails.send(sendParams);

    if (sendError) {
      logger.error('Resend send error', sendError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    // Find thread and mark parent as replied if this is a reply
    let threadId: string | null = null;
    let parentMessageId: string | null = null;
    if (inReplyToId) {
      const [parent] = await db.select().from(emails).where(eq(emails.id, inReplyToId)).limit(1);
      if (parent) {
        threadId = parent.threadId || parent.id;
        parentMessageId = parent.messageId || null;
        if (parent.direction === 'inbound' && parent.status !== 'replied') {
          await db.update(emails).set({
            status: 'replied',
            repliedAt: new Date(),
          }).where(eq(emails.id, parent.id));
        }
      }
    }

    const [saved] = await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      status: 'sent',
      fromEmail: 'notifications@mayells.com',
      fromName: 'Mayell',
      toEmail: to,
      subject,
      bodyHtml: html || null,
      bodyText: text || null,
      inReplyToId: inReplyToId || null,
      inReplyToMessageId: parentMessageId,
      threadId,
    }).returning();

    return NextResponse.json({ data: saved });
  } catch (error) {
    logger.error('Admin email send error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/emails — update status (single or bulk)
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, ids, status } = body;

    const validStatuses = ['received', 'read', 'replied', 'sent', 'delivered', 'bounced'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Bulk update
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (status === 'read') updateData.readAt = new Date();
      if (status === 'replied') updateData.repliedAt = new Date();

      await db.update(emails).set(updateData).where(inArray(emails.id, ids));
      return NextResponse.json({ success: true, updated: ids.length });
    }

    // Single update
    if (!id) return NextResponse.json({ error: 'Email ID required' }, { status: 400 });

    if (status) {
      const updateData: Record<string, unknown> = { status };
      if (status === 'read') updateData.readAt = new Date();
      if (status === 'replied') updateData.repliedAt = new Date();

      await db.update(emails).set(updateData).where(eq(emails.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin email update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/emails — delete emails (single or bulk)
export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, ids } = body;

    const idsToDelete: string[] = ids && Array.isArray(ids) ? ids : id ? [id] : [];
    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'Email ID(s) required' }, { status: 400 });
    }

    // Clear thread references pointing to these emails first
    await db
      .update(emails)
      .set({ threadId: null })
      .where(inArray(emails.threadId, idsToDelete));

    await db
      .update(emails)
      .set({ inReplyToId: null })
      .where(inArray(emails.inReplyToId, idsToDelete));

    // Delete the emails
    await db.delete(emails).where(inArray(emails.id, idsToDelete));

    return NextResponse.json({ success: true, deleted: idsToDelete.length });
  } catch (error) {
    logger.error('Admin email delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
