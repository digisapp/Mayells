import { NextRequest, NextResponse, after } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq, and, desc, or, sql } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { logger } from '@/lib/logger';
import { processInboundEmail } from '@/lib/ai/email-reply';
import {
  forwardInboundEmail,
  listForwardableAttachments,
  type ForwardableAttachment,
} from '@/lib/email/notifications';
import { handleResendEvent } from '@/lib/email/resend-events';
import { claimWebhookEvent, finalizeWebhookLog } from '@/lib/webhooks/log';

// Mail that originates from our own sending identities is a platform
// notification looping back (info@ is both a notify target and the inbound
// address). It is stored for the record but never forwarded, never fed to the
// AI, and never counted as unread.
const OWN_DOMAINS = ['@mayells.com', '@mayellauctions.com'];

function isOwnAddress(email: string): boolean {
  const lower = email.toLowerCase();
  return OWN_DOMAINS.some((d) => lower.endsWith(d));
}

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
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user?.id || null;
}

// ─── Thread Detection ─────────────────────────────────────────────────────────

/** Strip every leading "Re:", "Fwd:", "FW:" (in any case, repeated) prefix. */
function stripReplyPrefixes(subject: string): string {
  return subject.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').trim();
}

async function findThread(params: {
  inReplyToHeader: string | null;
  fromEmail: string;
  subject: string;
}): Promise<{ inReplyToId: string | null; threadId: string | null }> {
  if (params.inReplyToHeader) {
    // Resend does not return the RFC Message-ID of mail we send, only its own
    // id — which it uses as the local part of the Message-ID it generates. So
    // a customer's In-Reply-To can be matched either against a stored
    // message_id or against resend_id via that local part.
    const header = params.inReplyToHeader.trim();
    const localPart = header.replace(/^<|>$/g, '').split('@')[0] || '';
    const [parent] = await db
      .select({ id: emails.id, threadId: emails.threadId })
      .from(emails)
      .where(
        localPart
          ? or(eq(emails.messageId, header), eq(emails.resendId, localPart))
          : eq(emails.messageId, header),
      )
      .orderBy(desc(emails.createdAt))
      .limit(1);
    if (parent) {
      return { inReplyToId: parent.id, threadId: parent.threadId || parent.id };
    }
  }

  const cleanSubject = stripReplyPrefixes(params.subject).toLowerCase();
  if (cleanSubject) {
    const fromLower = params.fromEmail.toLowerCase();
    const [match] = await db
      .select({ id: emails.id, threadId: emails.threadId })
      .from(emails)
      .where(
        and(
          or(
            sql`lower(${emails.toEmail}) = ${fromLower}`,
            sql`lower(${emails.fromEmail}) = ${fromLower}`,
          ),
          // Normalise the stored subject the same way so "RE: re: Foo" and
          // "Fwd: Foo" all land in the "Foo" thread.
          sql`lower(regexp_replace(coalesce(${emails.subject}, ''), '^((re|fwd?|fw)\\s*:\\s*)+', '', 'i')) = ${cleanSubject}`,
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

// ─── Background work (off the webhook response path) ─────────────────────────

/**
 * Forward a copy to the owner's external mailbox, then classify/draft with the
 * AI. Runs via `after()` so Resend gets its 200 as soon as the row is stored;
 * both steps are best-effort and log their own failures.
 */
async function postProcessInbound(params: {
  savedId: string;
  resendEmailId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  attachmentMeta: Array<{ id: string; filename: string; size: number; contentType: string }>;
}) {
  const { savedId, resendEmailId, attachmentMeta } = params;

  // Attachments matter here — appraisal photos ARE the inquiry. Relay them
  // as Resend-hosted signed URLs so we never buffer file bytes.
  let forwardAttachments: ForwardableAttachment[] = [];
  let skippedAttachments = 0;
  if (attachmentMeta.length > 0 && resendEmailId) {
    try {
      ({ attachments: forwardAttachments, skipped: skippedAttachments } =
        await listForwardableAttachments(resendEmailId));
    } catch (attErr) {
      logger.error('Failed to fetch inbound attachments from Resend', attErr, { emailId: savedId });
      forwardAttachments = [];
    }
  }

  const forwardBase = {
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    toEmail: params.toEmail,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    bodyText: params.bodyText,
  };

  try {
    await forwardInboundEmail({ ...forwardBase, attachments: forwardAttachments, skippedAttachments });
  } catch (err) {
    logger.error('Inbound email forward failed', err, { emailId: savedId });
    // If the attachments are what sank it, still get the body through.
    if (forwardAttachments.length > 0) {
      try {
        await forwardInboundEmail({
          ...forwardBase,
          skippedAttachments: forwardAttachments.length + skippedAttachments,
        });
      } catch (retryErr) {
        logger.error('Body-only forward retry failed', retryErr, { emailId: savedId });
      }
    }
  }

  try {
    await processInboundEmail(savedId);
  } catch (err) {
    logger.error('AI email processing failed', err, { emailId: savedId });
  }
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Fail closed: without a webhook secret we cannot verify events, so never process
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('RESEND_WEBHOOK_SECRET is not configured — rejecting inbound email webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const startMs = Date.now();
  // The log row is the dedup record and is written BEFORE any work. It only
  // exists once the request is authenticated, so the 401 early-returns above
  // its creation never leave a trace and the finally-block has nothing to do.
  let logId: string | null = null;
  let status: 'success' | 'failed' | 'ignored' = 'ignored';
  let errorMessage: string | undefined;
  let relatedType: string | undefined;
  let relatedId: string | undefined;

  try {
    const rawBody = await req.text();

    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 401 });
    }

    const wh = new Webhook(webhookSecret);
    try {
      wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      logger.error('Webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: { type?: string; data?: Record<string, unknown> };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const type = body.type || 'unknown';
    const data = (body.data ?? {}) as Record<string, unknown>;

    // Log FIRST. The partial unique index on (provider, event_id) makes the
    // claim the atomic dedup: a concurrent delivery loses the insert race, and
    // one whose earlier attempt succeeded (or is still in flight) is a
    // duplicate. A redelivery of an attempt that `failed` reclaims that row so
    // the failure count in /admin/webhooks stays truthful.
    const claim = await claimWebhookEvent({
      provider: 'resend',
      eventId: svixId,
      eventType: type,
      payload: body,
    });
    if (!claim.claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    logId = claim.id;

    // ── Inbound email ──────────────────────────────────────────────────────
    if (type === 'email.received') {
      const { email: fromEmail, name: fromName } = parseEmailAddress(String(data.from ?? ''));
      const toList = Array.isArray(data.to) ? (data.to as unknown[]) : [];
      const { email: toEmail } = parseEmailAddress(String(toList[0] ?? ''));
      const subject = String(data.subject || '(no subject)');
      const resendEmailId = (data.email_id as string | undefined) || (data.id as string | undefined) || null;
      const messageId = (data.message_id as string | undefined) || null;

      let bodyHtml: string | null = null;
      let bodyText: string | null = null;
      let inReplyToHeader: string | null = null;
      let attachmentMeta: Array<{ id: string; filename: string; size: number; contentType: string }> = [];

      if (resendEmailId) {
        try {
          const resend = getResend();
          const { data: fullEmail } = await resend.emails.receiving.get(resendEmailId);
          if (fullEmail) {
            bodyHtml = fullEmail.html || null;
            bodyText = fullEmail.text || null;
            inReplyToHeader = fullEmail.headers?.['in-reply-to'] || fullEmail.headers?.['In-Reply-To'] || null;
            attachmentMeta = (fullEmail.attachments ?? []).map((a) => ({
              id: a.id,
              filename: a.filename || 'attachment',
              size: a.size,
              contentType: a.content_type,
            }));
          }
        } catch (fetchErr) {
          logger.error('Failed to fetch inbound email content from Resend', fetchErr);
        }
      }

      const ownAddress = isOwnAddress(fromEmail);
      const spam = isSpamEmail(fromEmail, subject);
      const { inReplyToId, threadId } = await findThread({ inReplyToHeader, fromEmail, subject });
      const userId = await findUserByEmail(fromEmail);

      // NB: a customer reply never rewrites the parent OUTBOUND row's status —
      // "answered" is derived from the thread when listing.
      const [saved] = await db.insert(emails).values({
        resendId: resendEmailId,
        direction: 'inbound',
        status: ownAddress ? 'read' : 'received',
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
        attachments: attachmentMeta.length > 0 ? attachmentMeta : null,
        // Self-notifications are filed as "system": already read, no AI pass.
        ...(ownAddress && {
          readAt: new Date(),
          aiCategory: 'system',
          aiSummary: 'Platform notification from one of our own addresses.',
        }),
      }).returning({ id: emails.id });

      if (saved && !spam && !ownAddress) {
        const job = {
          savedId: saved.id,
          resendEmailId,
          fromEmail,
          fromName,
          toEmail,
          subject,
          bodyHtml,
          bodyText,
          attachmentMeta,
        };
        after(() => postProcessInbound(job));
      }

      relatedType = 'email';
      relatedId = saved?.id;
      status = 'success';
    } else {
      // Delivery-status events share their handler with the admin replay
      // route (src/lib/email/resend-events.ts); anything else is ignored.
      const result = await handleResendEvent({ type, data });
      status = result.status;
      relatedType = result.relatedType;
      relatedId = result.relatedId;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Email webhook error', error);
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  } finally {
    // Only a claimed delivery has a row to finalize — the 401/400/duplicate
    // early-returns above never logged anything. Never throws.
    if (logId) {
      await finalizeWebhookLog(logId, {
        status,
        errorMessage,
        processingMs: Date.now() - startMs,
        relatedType,
        relatedId,
      });
    }
  }
}
