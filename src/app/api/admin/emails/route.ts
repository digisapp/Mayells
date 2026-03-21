import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm';
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

// GET /api/admin/emails?direction=inbound|outbound&search=...&page=1&spam=true|false
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const direction = req.nextUrl.searchParams.get('direction');
    const search = req.nextUrl.searchParams.get('search')?.trim();
    const spamParam = req.nextUrl.searchParams.get('spam');
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;

    // Build conditions
    const conditions = [];
    if (direction) {
      conditions.push(eq(emails.direction, direction as 'inbound' | 'outbound'));
    }
    // Spam filter: 'true' shows only spam, 'false' excludes spam, omitted shows all
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

    // Parallel: fetch page + total count
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

    const { to, subject, html, text, inReplyToId } = await req.json();
    if (!to || !subject || (!html && !text)) {
      return NextResponse.json({ error: 'to, subject, and body required' }, { status: 400 });
    }

    const resend = getResend();
    const fromAddress = 'Mayell <notifications@mayellauctions.com>';

    const { data: sent, error: sendError } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    });

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
        // Mark parent inbound email as "replied"
        if (parent.direction === 'inbound' && parent.status !== 'replied') {
          await db.update(emails).set({ status: 'replied' }).where(eq(emails.id, parent.id));
        }
      }
    }

    // Log sent email to DB
    const [saved] = await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      status: 'sent',
      fromEmail: 'notifications@mayellauctions.com',
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

// PATCH /api/admin/emails — update status (mark as read, etc.)
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id, status } = await req.json();
    if (!id) return NextResponse.json({ error: 'Email ID required' }, { status: 400 });

    const validStatuses = ['received', 'read', 'replied', 'sent', 'delivered', 'bounced'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (status) {
      await db.update(emails).set({ status }).where(eq(emails.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin email update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
