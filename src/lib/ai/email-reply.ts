import { generateText } from 'ai';
import { getModel } from './client';
import { db } from '@/db';
import { emails, automationSettings, type Email } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { BUSINESS } from '@/lib/config';
import { escapeHtml } from '@/lib/email/escape';
import { replySubject, sendAdminEmail } from '@/lib/email/admin-inbox';
import { autoReplySuppressionReason, type HeaderBag } from '@/lib/email/auto-reply-guards';
import { logger } from '@/lib/logger';

// ─── Categories ──────────────────────────────────────────────────────────────

export const EMAIL_CATEGORIES = [
  'appraisal_request',
  'consignment_inquiry',
  'purchase_inquiry',
  'auction_question',
  'estate_evaluation',
  'scheduling',
  'general_inquiry',
  'feedback',
  'partnership',
  'support',
  'personal',
  'spam',
  'other',
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

// Categories safe for auto-reply
export const AUTO_SEND_SAFE_CATEGORIES: EmailCategory[] = [
  'appraisal_request',
  'consignment_inquiry',
  'purchase_inquiry',
  'auction_question',
  'estate_evaluation',
  'scheduling',
  'general_inquiry',
];

export const AUTO_SEND_MIN_CONFIDENCE = 0.85;

// ─── System Prompt ───────────────────────────────────────────────────────────

const EMAIL_SYSTEM_PROMPT = `You are the AI email assistant for Mayells, a luxury auction house in Palm Beach County, Florida specializing in fine art, antiques, jewelry, watches, fashion, and design.

Your role: Classify incoming emails AND draft professional, warm replies on behalf of Mayells.

Key business info:
- We offer FREE appraisals and estate evaluations
- We buy, sell, and consign luxury items
- Services: appraisals, estate liquidation, collection management, auction advisory
- Departments: Art, Antiques & Collectibles, Luxury Goods, Fashion & Accessories, Jewelry & Watches, Design & Interiors
- Phone: ${BUSINESS.phone}
- Email: ${BUSINESS.email}
- Website: ${BUSINESS.url}

You MUST respond with valid JSON in this exact format:
{
  "category": "<one of: ${EMAIL_CATEGORIES.join(', ')}>",
  "confidence": <number 0.0 to 1.0>,
  "summary": "<1-2 sentence summary of the email for admin quick-view>",
  "draft": "<your draft reply text, or null if spam>"
}

Category definitions:
- appraisal_request: Wants an item appraised or valued
- consignment_inquiry: Wants to sell or consign items through Mayells
- purchase_inquiry: Wants to buy an item, asks about availability or pricing
- auction_question: Questions about upcoming auctions, bidding, results
- estate_evaluation: Estate liquidation, collection evaluation, large lots
- scheduling: Wants to book an appointment, visit, or meeting
- general_inquiry: General questions about Mayells services
- feedback: Compliments, complaints, or suggestions
- partnership: Business partnerships, vendor inquiries, media
- support: Account issues, billing, technical help
- personal: Personal communication to a specific staff member
- spam: Marketing, automated emails, newsletters, system notifications, unsubscribe
- other: Doesn't fit other categories

Draft reply guidelines:
- Be professional, warm, and concise (2-5 sentences for simple replies, longer for detailed inquiries)
- Sign off as "The Mayells Team" unless context suggests a more personal touch
- If someone asks about selling/consigning, encourage a free appraisal
- If someone asks about buying, point them to the website or upcoming auctions
- If they're asking about a specific item, say you'll look into it and follow up
- If about scheduling, confirm you'll get back with availability
- Never make up specific prices, auction dates, or item details — say you'll confirm
- Include a call to action when appropriate (schedule appraisal, visit website, call us)
- For spam: set draft to null

IMPORTANT: Respond with ONLY the JSON object, no markdown, no code fences.`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailClassification {
  category: EmailCategory;
  confidence: number;
  summary: string;
  draftHtml: string | null;
  draftText: string | null;
}

// The model's draft is plain text. Escape it BEFORE turning newlines into
// <br> so nothing it (or the customer's quoted mail) contains is ever
// interpreted as markup in the outgoing HTML.
function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

// ─── Branded Email Template ──────────────────────────────────────────────────

export function brandedReplyHtml(draftText: string, originalEmail: {
  createdAt: Date;
  fromName: string | null;
  fromEmail: string;
  bodyHtml: string | null;
  bodyText: string | null;
}): string {
  const quotedContent = originalEmail.bodyHtml
    || (originalEmail.bodyText ? escapeHtml(originalEmail.bodyText).replace(/\n/g, '<br />') : '')
    || '';
  const dateStr = new Date(originalEmail.createdAt).toLocaleDateString();
  const senderName = escapeHtml(originalEmail.fromName || originalEmail.fromEmail);

  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
      <div style="border-bottom: 2px solid #D4C5A0; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 22px; color: #272D35; letter-spacing: 2px;">MAYELLS</h1>
        <p style="margin: 4px 0 0; font-size: 11px; color: #999; letter-spacing: 1px; text-transform: uppercase;">The Auction House of the Future</p>
      </div>
      <div style="font-size: 15px; line-height: 1.7;">
        ${textToHtml(draftText)}
      </div>
      <div style="border-left: 2px solid #D4C5A0; padding-left: 12px; margin-top: 32px; color: #666; font-size: 13px;">
        <p style="margin: 0 0 4px; font-style: italic;">On ${dateStr}, ${senderName} wrote:</p>
        <div>${quotedContent}</div>
      </div>
      <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e2d9; font-size: 11px; color: #999; text-align: center;">
        <p style="margin: 0;">Mayells &middot; Palm Beach County, Florida</p>
        <p style="margin: 4px 0 0;">${BUSINESS.phone} &middot; ${BUSINESS.email}</p>
      </div>
    </div>
  `;
}

// ─── Classify + Draft ────────────────────────────────────────────────────────

export async function classifyAndDraftReply(params: {
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  /**
   * Optional operator steering ("offer a Tuesday slot", "be more formal")
   * from the inbox's "Draft with instructions" control. Trusted input — it
   * comes from an admin, not from the email — so it outranks the defaults.
   */
  instructions?: string | null;
}): Promise<EmailClassification> {
  const emailContent = params.bodyText || params.bodyHtml?.replace(/<[^>]*>/g, '') || '';
  const instructions = params.instructions?.trim().slice(0, 1000);
  const instructionBlock = instructions
    ? `

Instructions from the Mayells operator for this draft — follow them; they take priority over the default draft guidelines. The operator wants a reply, so "draft" must not be null:
${instructions}`
    : '';

  const { text: aiResponse } = await generateText({
    model: getModel('fast'),
    system: EMAIL_SYSTEM_PROMPT,
    prompt: `Classify and draft a reply to this email:${instructionBlock}

From: ${params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail}
Subject: ${params.subject}

${emailContent.slice(0, 3000)}`,
    maxOutputTokens: 1200,
  });

  try {
    // Strip any markdown code fences if present
    const cleaned = aiResponse.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);

    const category = EMAIL_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
    const summary = String(parsed.summary || '').slice(0, 500);
    const draftText = parsed.draft ? String(parsed.draft).trim() : null;

    const draftHtml = draftText
      ? `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${textToHtml(draftText)}</div>`
      : null;

    return { category, confidence, summary, draftHtml, draftText };
  } catch {
    // Fallback: if AI returned plain text instead of JSON
    const text = aiResponse.trim();
    if (text === 'SPAM' || text.toLowerCase().includes('"category":"spam"')) {
      return { category: 'spam', confidence: 0.8, summary: 'Likely spam or automated email', draftHtml: null, draftText: null };
    }
    // Treat as a plain draft reply
    return {
      category: 'other',
      confidence: 0.5,
      summary: 'Email classified with low confidence',
      draftHtml: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${textToHtml(text)}</div>`,
      draftText: text,
    };
  }
}

/**
 * (Re)generate the AI draft for a stored inbound email on demand — the
 * inbox's "Regenerate draft" / "Draft with instructions" controls. Only the
 * draft fields are rewritten; the classification is filled in just where it
 * is still missing, so a re-draft never re-files an email. Never sends.
 * Returns null when the model declined to draft (e.g. it judged it spam).
 */
export async function generateAndStoreDraft(
  email: Email,
  instructions?: string | null,
): Promise<{ draftText: string; draftHtml: string; draftedAt: Date } | null> {
  const result = await classifyAndDraftReply({
    fromEmail: email.fromEmail,
    fromName: email.fromName,
    subject: email.subject || '',
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    instructions,
  });
  if (!result.draftText || !result.draftHtml) return null;

  const draftedAt = new Date();
  await db.update(emails).set({
    aiDraftHtml: result.draftHtml,
    aiDraftText: result.draftText,
    aiDraftedAt: draftedAt,
    ...(!email.aiCategory && {
      aiCategory: result.category,
      aiConfidence: result.confidence,
      aiSummary: result.summary,
    }),
  }).where(eq(emails.id, email.id));

  return { draftText: result.draftText, draftHtml: result.draftHtml, draftedAt };
}

/** How long after our last outbound in a thread we refuse to auto-reply again. */
const AUTO_REPLY_THREAD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** And never more than this many auto-sends in one thread, ever. */
const MAX_AUTO_REPLIES_PER_THREAD = 3;

/**
 * Send the stored AI draft of an inbound email as a reply, with the branded
 * template. The manual "Send AI draft" button and the auto-reply share this
 * so the two look identical to the customer.
 */
export async function sendAiDraft(
  email: Email,
  opts: { auto?: boolean; category?: string | null } = {},
): Promise<{ ok: true; outboundId: string } | { ok: false; status: number; error: string }> {
  if (email.direction !== 'inbound') return { ok: false, status: 400, error: 'Only incoming mail has a draft' };
  if (!email.aiDraftText) return { ok: false, status: 400, error: 'No AI draft for this email' };
  if (email.status === 'replied') return { ok: false, status: 409, error: 'This email was already answered' };

  const brandedHtml = brandedReplyHtml(email.aiDraftText, {
    createdAt: email.createdAt,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    bodyHtml: email.bodyHtml,
    bodyText: email.bodyText,
  });

  const result = await sendAdminEmail({
    to: email.fromEmail,
    subject: replySubject(email.subject),
    text: email.aiDraftText,
    html: brandedHtml,
    inReplyToId: email.id,
    rowExtras: {
      aiAutoSent: !!opts.auto,
      aiCategory: opts.category ?? email.aiCategory ?? null,
      ...(opts.auto && { aiSummary: `Auto-reply to: ${email.aiSummary || email.subject || 'an email'}` }),
    },
  });
  if (!result.ok) return result;

  if (opts.auto) {
    await db.update(emails).set({ aiAutoSent: true }).where(eq(emails.id, email.id));
  }
  return { ok: true, outboundId: result.email.id };
}

/**
 * Process an inbound email: classify, generate AI draft, and optionally auto-send.
 * Called from the webhook after storing the inbound email. `headers` are the
 * raw headers of the received message, for the automation guards.
 */
export async function processInboundEmail(emailId: string, opts: { headers?: HeaderBag } = {}) {
  try {
    const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
    if (!email || email.isSpam || email.direction !== 'inbound') return;

    const result = await classifyAndDraftReply({
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      subject: email.subject || '',
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
    });

    // AI classified as spam — mark it
    if (result.category === 'spam') {
      await db.update(emails).set({
        isSpam: true,
        aiCategory: result.category,
        aiConfidence: result.confidence,
        aiSummary: result.summary,
      }).where(eq(emails.id, emailId));
      return;
    }

    // Save classification + draft to email record
    await db.update(emails).set({
      aiDraftHtml: result.draftHtml,
      aiDraftText: result.draftText,
      aiDraftedAt: result.draftText ? new Date() : null,
      aiCategory: result.category,
      aiConfidence: result.confidence,
      aiSummary: result.summary,
    }).where(eq(emails.id, emailId));

    // ─── Mail-loop guards ────────────────────────────────────────────────────
    // Evaluated before the setting so a misconfigured toggle can't override
    // them: never answer our own addresses, bots, list mail or auto-responders,
    // and never keep answering the same thread.
    const suppression = autoReplySuppressionReason({ from: email.fromEmail, subject: email.subject, headers: opts.headers });
    if (suppression) {
      logger.info('AI auto-reply suppressed', { emailId, reason: suppression });
      return;
    }

    // Check if auto-reply is enabled
    const [settings] = await db.select().from(automationSettings).limit(1);
    if (!settings?.aiEmailAutoReply) return;

    // Safety gate: only auto-send for safe categories with high confidence
    const isSafeCategory = AUTO_SEND_SAFE_CATEGORIES.includes(result.category as EmailCategory);
    const isHighConfidence = result.confidence >= AUTO_SEND_MIN_CONFIDENCE;

    if (!isSafeCategory || !isHighConfidence || !result.draftText) {
      logger.info('AI draft saved but not auto-sent (safety gate)', {
        emailId,
        category: result.category,
        confidence: result.confidence,
        safeCategory: isSafeCategory,
        highConfidence: isHighConfidence,
      });
      return;
    }

    // Thread caps: at most a few auto-sends per thread, and never twice in
    // 24 hours (whoever sent the last reply).
    const threadKey = email.threadId || emailId;
    const [{ autoSent, recent } = { autoSent: 0, recent: 0 }] = await db
      .select({
        autoSent: sql<number>`count(*) filter (where ${emails.aiAutoSent} = true)::int`,
        recent: sql<number>`count(*) filter (where ${emails.createdAt} > ${new Date(Date.now() - AUTO_REPLY_THREAD_COOLDOWN_MS)})::int`,
      })
      .from(emails)
      .where(and(eq(emails.threadId, threadKey), eq(emails.direction, 'outbound')));
    if (Number(autoSent) >= MAX_AUTO_REPLIES_PER_THREAD) {
      logger.warn('Thread hit AI auto-reply cap — not auto-sending', { emailId, threadKey, count: Number(autoSent) });
      return;
    }
    if (Number(recent) > 0) {
      logger.info('AI auto-reply suppressed: we already replied on this thread in the last 24h', { emailId, threadKey });
      return;
    }

    const [fresh] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
    if (!fresh) return;
    const sent = await sendAiDraft(fresh, { auto: true, category: result.category });
    if (!sent.ok) {
      logger.error('AI auto-reply send failed', undefined, { emailId, error: sent.error });
      return;
    }

    logger.info('AI auto-replied to email', {
      emailId,
      to: email.fromEmail,
      category: result.category,
      confidence: result.confidence,
      outboundId: sent.outboundId,
    });
  } catch (error) {
    logger.error('AI email processing failed', error, { emailId });
  }
}
