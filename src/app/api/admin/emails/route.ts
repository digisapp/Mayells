import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq, desc, and, or, ilike, sql, inArray } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { logger } from '@/lib/logger';

const EMAIL_STATUSES = ['received', 'read', 'replied', 'sent', 'delivered', 'bounced'] as const;

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
}).refine(d => d.id || (d.ids && d.ids.length > 0), { message: 'id or ids required' });

const emailDeleteSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
}).refine(d => d.id || (d.ids && d.ids.length > 0), { message: 'id or ids required' });

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

    const parsedSend = emailSendSchema.safeParse(await req.json());
    if (!parsedSend.success) {
      return NextResponse.json({ error: parsedSend.error.issues[0].message }, { status: 400 });
    }

    const { to, subject, html, text, inReplyToId, attachments } = parsedSend.data;

    const resend = getResend();
    const fromAddress = 'Mayells <notifications@mayells.com>';

    const sendPayload = {
      from: fromAddress,
      to,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
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

    const parsedPatch = emailPatchSchema.safeParse(await req.json());
    if (!parsedPatch.success) {
      return NextResponse.json({ error: parsedPatch.error.issues[0].message }, { status: 400 });
    }

    const { id, ids, status } = parsedPatch.data;

    const buildUpdate = (s?: typeof status) => {
      const u: Record<string, unknown> = {};
      if (s) u.status = s;
      if (s === 'read') u.readAt = new Date();
      if (s === 'replied') u.repliedAt = new Date();
      return u;
    };

    if (ids && ids.length > 0) {
      await db.update(emails).set(buildUpdate(status)).where(inArray(emails.id, ids));
      return NextResponse.json({ success: true, updated: ids.length });
    }

    await db.update(emails).set(buildUpdate(status)).where(eq(emails.id, id!));
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

    const parsedDelete = emailDeleteSchema.safeParse(await req.json());
    if (!parsedDelete.success) {
      return NextResponse.json({ error: parsedDelete.error.issues[0].message }, { status: 400 });
    }

    const { id, ids } = parsedDelete.data;
    const idsToDelete: string[] = ids && ids.length > 0 ? ids : id ? [id] : [];

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
