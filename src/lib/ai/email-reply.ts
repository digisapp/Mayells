import { generateText } from 'ai';
import { getModel } from './client';
import { db } from '@/db';
import { emails, automationSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

// ─── Categories ──────────────────────────────────────────────────────────────

const EMAIL_CATEGORIES = [
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

type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

// Categories safe for auto-reply
const AUTO_SEND_SAFE_CATEGORIES: EmailCategory[] = [
  'appraisal_request',
  'consignment_inquiry',
  'purchase_inquiry',
  'auction_question',
  'estate_evaluation',
  'scheduling',
  'general_inquiry',
];

const AUTO_SEND_MIN_CONFIDENCE = 0.85;

// ─── System Prompt ───────────────────────────────────────────────────────────

const EMAIL_SYSTEM_PROMPT = `You are the AI email assistant for Mayell, a luxury auction house in Palm Beach County, Florida specializing in fine art, antiques, jewelry, watches, fashion, and design.

Your role: Classify incoming emails AND draft professional, warm replies on behalf of Mayell.

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
- consignment_inquiry: Wants to sell or consign items through Mayell
- purchase_inquiry: Wants to buy an item, asks about availability or pricing
- auction_question: Questions about upcoming auctions, bidding, results
- estate_evaluation: Estate liquidation, collection evaluation, large lots
- scheduling: Wants to book an appointment, visit, or meeting
- general_inquiry: General questions about Mayell services
- feedback: Compliments, complaints, or suggestions
- partnership: Business partnerships, vendor inquiries, media
- support: Account issues, billing, technical help
- personal: Personal communication to a specific staff member
- spam: Marketing, automated emails, newsletters, system notifications, unsubscribe
- other: Doesn't fit other categories

Draft reply guidelines:
- Be professional, warm, and concise (2-5 sentences for simple replies, longer for detailed inquiries)
- Sign off as "The Mayell Team" unless context suggests a more personal touch
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

// ─── Branded Email Template ──────────────────────────────────────────────────

function brandedReplyHtml(draftText: string, originalEmail: {
  createdAt: Date;
  fromName: string | null;
  fromEmail: string;
  bodyHtml: string | null;
  bodyText: string | null;
}): string {
  const quotedContent = originalEmail.bodyHtml
    || originalEmail.bodyText?.replace(/\n/g, '<br />')
    || '';
  const dateStr = new Date(originalEmail.createdAt).toLocaleDateString();
  const senderName = originalEmail.fromName || originalEmail.fromEmail;

  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
      <div style="border-bottom: 2px solid #D4C5A0; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 22px; color: #272D35; letter-spacing: 2px;">MAYELL</h1>
        <p style="margin: 4px 0 0; font-size: 11px; color: #999; letter-spacing: 1px; text-transform: uppercase;">The Auction House of the Future</p>
      </div>
      <div style="font-size: 15px; line-height: 1.7;">
        ${draftText.replace(/\n/g, '<br />')}
      </div>
      <div style="border-left: 2px solid #D4C5A0; padding-left: 12px; margin-top: 32px; color: #666; font-size: 13px;">
        <p style="margin: 0 0 4px; font-style: italic;">On ${dateStr}, ${senderName} wrote:</p>
        <div>${quotedContent}</div>
      </div>
      <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e2d9; font-size: 11px; color: #999; text-align: center;">
        <p style="margin: 0;">Mayell &middot; Palm Beach County, Florida</p>
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
}): Promise<EmailClassification> {
  const emailContent = params.bodyText || params.bodyHtml?.replace(/<[^>]*>/g, '') || '';

  const { text: aiResponse } = await generateText({
    model: getModel('fast'),
    system: EMAIL_SYSTEM_PROMPT,
    prompt: `Classify and draft a reply to this email:

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
      ? `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${draftText.replace(/\n/g, '<br />')}</div>`
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
      draftHtml: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${text.replace(/\n/g, '<br />')}</div>`,
      draftText: text,
    };
  }
}

/**
 * Process an inbound email: classify, generate AI draft, and optionally auto-send.
 * Called from the webhook after storing the inbound email.
 */
export async function processInboundEmail(emailId: string) {
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
      aiDraftedAt: new Date(),
      aiCategory: result.category,
      aiConfidence: result.confidence,
      aiSummary: result.summary,
    }).where(eq(emails.id, emailId));

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

    // Auto-send the AI draft with branded template
    const resend = getResend();
    const replySubject = `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`;

    const brandedHtml = brandedReplyHtml(result.draftText, {
      createdAt: email.createdAt,
      fromName: email.fromName,
      fromEmail: email.fromEmail,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
    });

    const { data: sent } = await resend.emails.send({
      from: `Mayell <notifications@mayellauctions.com>`,
      to: email.fromEmail,
      subject: replySubject,
      html: brandedHtml,
      text: `${result.draftText}\n\n> On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:\n> ${(email.bodyText || '').split('\n').join('\n> ')}`,
    });

    // Log the sent reply
    await db.insert(emails).values({
      resendId: sent?.id || null,
      direction: 'outbound',
      status: 'sent',
      fromEmail: 'notifications@mayellauctions.com',
      fromName: 'Mayell',
      toEmail: email.fromEmail,
      subject: replySubject,
      bodyHtml: brandedHtml,
      bodyText: result.draftText,
      inReplyToId: emailId,
      threadId: email.threadId || emailId,
      aiAutoSent: true,
      aiCategory: result.category,
    });

    // Mark original as replied
    await db.update(emails).set({
      status: 'replied',
      aiAutoSent: true,
      repliedAt: new Date(),
    }).where(eq(emails.id, emailId));

    logger.info('AI auto-replied to email', {
      emailId,
      to: email.fromEmail,
      category: result.category,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('AI email processing failed', error, { emailId });
  }
}
