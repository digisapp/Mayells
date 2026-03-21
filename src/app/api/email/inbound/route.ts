import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq, and, desc, or } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { logger } from '@/lib/logger';

// ─── Spam Filtering ───────────────────────────────────────────────────────────

const SPAM_SENDER_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /bounce@/i,
  /notifications?@.*\.linkedin\.com/i,
  /notifications?@.*\.facebook\.com/i,
  /notifications?@.*\.twitter\.com/i,
];

const SPAM_SUBJECT_PATTERNS = [
  /unsubscribe/i,
  /out of office/i,
  /automatic reply/i,
  /auto.?reply/i,
  /delivery.*fail/i,
  /undeliver/i,
  /mail delivery/i,
];

function isSpamEmail(fromEmail: string, subject: string): boolean {
  for (const pattern of SPAM_SENDER_PATTERNS) {
    if (pattern.test(fromEmail)) return true;
  }
  for (const pattern of SPAM_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) return true;
  }
  return false;
}

// ─── Parse "Name <email>" format ──────────────────────────────────────────────

function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2].trim() };
  }
  return { email: raw.trim(), name: null };
}

// ─── User Linking ─────────────────────────────────────────────────────────────

async function findUserByEmail(email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return user?.id || null;
}

// ─── Thread Detection ─────────────────────────────────────────────────────────

async function findThread(params: {
  inReplyToHeader: string | null;
  fromEmail: string;
  subject: string;
}): Promise<{ inReplyToId: string | null; threadId: string | null }> {
  // Strategy 1: Match by In-Reply-To header → most reliable
  if (params.inReplyToHeader) {
    const [parent] = await db
      .select({ id: emails.id, threadId: emails.threadId })
      .from(emails)
      .where(eq(emails.messageId, params.inReplyToHeader))
      .limit(1);
    if (parent) {
      return { inReplyToId: parent.id, threadId: parent.threadId || parent.id };
    }
  }

  // Strategy 2: Match by sender + subject (strip Re:/Fwd: prefixes)
  const cleanSubject = params.subject.replace(/^(Re|Fwd|Fw):\s*/gi, '').trim();
  if (cleanSubject) {
    const [match] = await db
      .select({ id: emails.id, threadId: emails.threadId })
      .from(emails)
      .where(
        and(
          or(
            eq(emails.toEmail, params.fromEmail),
            eq(emails.fromEmail, params.fromEmail),
          ),
          eq(emails.subject, cleanSubject),
        ),
      )
      .orderBy(desc(emails.createdAt))
      .limit(1);
    if (match) {
      return { inReplyToId: match.id, threadId: match.threadId || match.id };
    }
  }

  return { inReplyToId: null, threadId: null };
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    // ── Inbound email ──────────────────────────────────────────────────────
    if (type === 'email.received') {
      // Resend webhook payload: data.from is a string, data.to is string[]
      const { email: fromEmail, name: fromName } = parseEmailAddress(data.from || '');
      const toRaw = data.to?.[0] || '';
      const { email: toEmail } = parseEmailAddress(toRaw);
      const subject = data.subject || '(no subject)';
      const resendEmailId = data.email_id || data.id || null;
      const messageId = data.message_id || null;

      // Fetch full email content (html, text, headers) from Resend API
      let bodyHtml: string | null = null;
      let bodyText: string | null = null;
      let inReplyToHeader: string | null = null;

      if (resendEmailId) {
        try {
          const resend = getResend();
          const { data: fullEmail } = await resend.emails.receiving.get(resendEmailId);
          if (fullEmail) {
            bodyHtml = fullEmail.html || null;
            bodyText = fullEmail.text || null;
            inReplyToHeader = fullEmail.headers?.['in-reply-to'] || fullEmail.headers?.['In-Reply-To'] || null;
          }
        } catch (fetchErr) {
          logger.error('Failed to fetch inbound email content from Resend', fetchErr);
        }
      }

      // Spam check
      const spam = isSpamEmail(fromEmail, subject);

      // Thread detection
      const { inReplyToId, threadId } = await findThread({
        inReplyToHeader,
        fromEmail,
        subject,
      });

      // If this is a reply to an outbound email, mark the original as "replied"
      if (inReplyToId) {
        await db
          .update(emails)
          .set({ status: 'replied' })
          .where(and(eq(emails.id, inReplyToId), eq(emails.direction, 'outbound')));
      }

      // Link to user
      const userId = await findUserByEmail(fromEmail);

      await db.insert(emails).values({
        resendId: resendEmailId,
        direction: 'inbound',
        status: 'received',
        fromEmail,
        fromName,
        toEmail,
        subject,
        bodyHtml,
        bodyText,
        messageId,
        inReplyToMessageId: inReplyToHeader,
        inReplyToId,
        threadId,
        userId,
        isSpam: spam,
      });

      return NextResponse.json({ received: true });
    }

    // ── Delivery status updates ────────────────────────────────────────────
    if (type === 'email.delivered' && data?.email_id) {
      await db
        .update(emails)
        .set({ status: 'delivered' })
        .where(eq(emails.resendId, data.email_id));
      return NextResponse.json({ received: true });
    }

    if (type === 'email.bounced' && data?.email_id) {
      await db
        .update(emails)
        .set({ status: 'bounced' })
        .where(eq(emails.resendId, data.email_id));
      return NextResponse.json({ received: true });
    }

    // Unhandled event — acknowledge
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Email webhook error', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
