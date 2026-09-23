import { streamText, stepCountIs, convertToModelMessages, tool } from 'ai';
import { z } from 'zod';
import { webSearch, xSearch } from '@ai-sdk/xai';
import { getModel } from '@/lib/ai/client';
import { chatTools } from '@/lib/ai/chat-tools';
import { db } from '@/db';
import { aiChatSettings } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { getMicrositeBySlug, type Microsite } from '@/lib/microsites/config';
import { recordConversationLead, emailUploadLink, attachChatPhotos } from '@/lib/prospects/intake';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

// Streaming + multi-step tool calls can exceed the default function timeout
export const maxDuration = 60;

const MAX_MESSAGE_CONTENT_LENGTH = 4000;

/**
 * Keep only user/assistant messages and truncate oversized text content so
 * arbitrary client payloads can't inject system roles or blow up token usage.
 */
function sanitizeMessages(rawMessages: unknown[]): unknown[] {
  return rawMessages
    .filter((m): m is Record<string, unknown> => {
      const role = (m as Record<string, unknown> | null)?.role;
      return role === 'user' || role === 'assistant';
    })
    .map((m) => {
      if (Array.isArray(m.parts)) {
        return {
          ...m,
          parts: m.parts.map((part: unknown) => {
            if (
              part &&
              typeof part === 'object' &&
              (part as { type?: unknown }).type === 'text' &&
              typeof (part as { text?: unknown }).text === 'string'
            ) {
              const text = (part as { text: string }).text;
              return text.length > MAX_MESSAGE_CONTENT_LENGTH
                ? { ...part, text: text.slice(0, MAX_MESSAGE_CONTENT_LENGTH) }
                : part;
            }
            return part;
          }),
        };
      }
      if (typeof m.content === 'string' && m.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return { ...m, content: m.content.slice(0, MAX_MESSAGE_CONTENT_LENGTH) };
      }
      return m;
    });
}

const BASE_PROMPT = `You are a helpful concierge for Mayells, a luxury auction house specializing in fine art, antiques, jewelry, watches, fashion, and design.

Key information about Mayells:
- We offer FREE appraisals and estate evaluations — no obligation, completely confidential
- We Buy: We make immediate offers on quality items
- We Sell: Through curated auctions and our gallery
- We Consign: Sellers earn top dollar through our auction process
- Gallery items are available for immediate purchase at fixed prices or by inquiry
- Departments: Art, Antiques & Collectibles, Luxury Goods, Fashion & Accessories, Jewelry & Watches, Design & Interiors

Professional & Advisor Services (visit /services for details):
- Appraisals & Valuations: USPAP-compliant written appraisals for estate tax, insurance, financial planning, loan collateral, and equitable distribution. In-home evaluations available.
- Sales Advisory: Dedicated account managers help determine the optimal sale strategy (auction, private sale, or gallery) with market analysis and timing recommendations.
- Estate Services: Full estate evaluations and liquidation, removal, logistics, and storage — from single items to large-volume properties. Coordination with attorneys and executors.
- Collection Management: Portfolio advisory, insurance documentation, acquisition guidance, market intelligence, authentication, and provenance research.

How to help visitors:
- If they want to sell or consign, offer to take their details right here in the chat (see "Taking an appraisal request" below), or they can use the appraisal form or call us
- If they ask about appraisals, valuations, estate services, or advisory — direct them to /services
- If they want to buy, direct them to our Auctions or Gallery pages
- If they ask about upcoming auctions, use the getUpcomingAuctions tool to provide real data
- If they ask about specific items, use searchLots to find matching inventory
- If they want to buy now, use getGalleryItems to show available gallery items
- If they ask what you deal in, use getCategories to list our departments
- If they ask about past results or prices achieved, use getRecentSoldItems
- Be warm, professional, and knowledgeable — like a specialist at a top auction house
- Keep responses concise (2-4 sentences unless more detail is needed)
- When asked about market values or pricing for specific items, use web search to find current auction results and market data
- If you don't know something specific, suggest they call or submit an appraisal request
- Always remind visitors that Mayells offers free appraisals if they want an expert evaluation

Image assessment:
- When a user uploads a photo of an item, provide a preliminary assessment
- Identify what the item appears to be (type, era, style, maker if recognizable)
- Give a general sense of market interest and collectibility
- Always recommend a professional in-person appraisal for an accurate valuation
- Encourage them to request a FREE appraisal through the website or by calling us
- Never give a specific dollar value from just a photo — say something like "items like this typically range from X to Y at auction" and recommend our free appraisal service

Taking an appraisal request:
- When a visitor wants to sell, consign, or get an appraisal, offer to pass their details to a specialist.
- You need: their name, a phone number or an email (ideally both), and what they have. Their town helps. Ask for what is missing, a question or two at a time, conversationally.
- Before calling requestAppraisal, read the details back in one line and ask them to confirm. Only call it after they say yes.
- Offer to email them a private link for uploading photos if they gave an email; set sendUploadLink only if they want it. Photos they already sent in this chat are attached automatically, so do not ask for those again.
- Only record what the visitor actually told you. Never invent or guess a name, number, or email.
- After it succeeds, thank them and say a specialist will be in touch. Do not promise a specific time.`;

async function getSystemPrompt(): Promise<{ prompt: string; enabled: boolean }> {
  try {
    const [settings] = await db.select().from(aiChatSettings).limit(1);
    if (!settings) return { prompt: BASE_PROMPT, enabled: true };
    if (!settings.enabled) return { prompt: '', enabled: false };

    const parts = [BASE_PROMPT];
    if (settings.personality) parts.push(`\nTone & personality: ${settings.personality}`);
    if (settings.customKnowledge) parts.push(`\nAdditional business knowledge: ${settings.customKnowledge}`);
    if (settings.upsellItems) parts.push(`\nPromote these when naturally relevant: ${settings.upsellItems}`);
    if (settings.disallowedTopics) parts.push(`\nIMPORTANT restrictions — do NOT: ${settings.disallowedTopics}`);

    return { prompt: parts.join('\n'), enabled: true };
  } catch {
    return { prompt: BASE_PROMPT, enabled: true };
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`ai:chat:${ip}`, { maxRequests: 30, windowSeconds: 3600, failClosed: true });
  if (!success) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
    });
  }

  const { prompt, enabled } = await getSystemPrompt();

  if (!enabled) {
    return new Response(
      'data: {"type":"start"}\ndata: {"type":"start-step"}\ndata: {"type":"text-start","id":"disabled"}\ndata: {"type":"text-delta","id":"disabled","delta":"Our chat is currently unavailable. Please call us or submit an appraisal request through the website."}\ndata: {"type":"finish-step"}\ndata: {"type":"finish","finishReason":"stop"}\ndata: [DONE]\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const body = await req.json();
  const messages = Array.isArray(body?.messages)
    ? sanitizeMessages(body.messages.slice(-20))
    : [];
  // The chat on a city microsite sends its slug; anything else is mayells.com.
  const site = typeof body?.site === 'string' ? getMicrositeBySlug(body.site) : undefined;

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = streamText({
    model: getModel('chat'),
    system: site ? `${prompt}\n\n${siteContext(site)}` : prompt,
    messages: await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0]),
    tools: {
      webSearch: webSearch(),
      xSearch: xSearch(),
      ...chatTools,
      requestAppraisal: appraisalRequestTool({ ip, site, messages }),
    },
    stopWhen: stepCountIs(3),
    maxOutputTokens: 600,
  });

  return result.toUIMessageStreamResponse();
}

function siteContext(site: Microsite): string {
  return `This visitor is on ${site.domain}, the ${site.city}, ${site.state} page of Mayells. ${
    site.serviceModel === 'local'
      ? `Mayells is local to ${site.region} and comes to the house for appraisals.`
      : `Mayells serves ${site.city} through scheduled visits from Palm Beach County; do not describe it as a local office.`
  } Answer with that town in mind.`;
}

/** Image data URLs the visitor attached anywhere in this conversation. */
function chatPhotoDataUrls(messages: unknown[]): string[] {
  const urls: string[] = [];
  for (const m of messages as { role?: string; parts?: unknown[] }[]) {
    if (m.role !== 'user' || !Array.isArray(m.parts)) continue;
    for (const part of m.parts as { type?: string; mediaType?: string; url?: string }[]) {
      if (part?.type === 'file' && part.mediaType?.startsWith('image/') && part.url?.startsWith('data:')) {
        urls.push(part.url);
      }
    }
  }
  return urls;
}

/**
 * Lets the concierge hand a visitor's details to the prospects funnel. Built
 * per request so it knows which site the chat is on and can rate-limit by
 * visitor: a chat is an unauthenticated form with a language model in front
 * of it, so it gets a tighter cap than the chat itself.
 */
function appraisalRequestTool({ ip, site, messages }: { ip: string; site?: Microsite; messages: unknown[] }) {
  return tool({
    description:
      'Pass a visitor\'s appraisal or consignment request to a Mayells specialist. Call only after the visitor has confirmed the details you read back to them.',
    inputSchema: z.object({
      name: z.string().trim().min(1).max(200).describe('Visitor\'s full name as they gave it'),
      phone: z.string().trim().max(50).optional().describe('Phone number as they gave it'),
      email: z.string().trim().email().max(320).optional().describe('Email address as they gave it'),
      town: z.string().trim().max(200).optional().describe('Town or neighbourhood where the items are'),
      items: z.string().trim().min(1).max(3000).describe('What they have, with any maker, period, quantity or history they mentioned'),
      sendUploadLink: z.boolean().optional().describe('True if they asked to be emailed a photo upload link'),
    }),
    execute: async (input) => {
      if (!input.phone && !input.email) {
        return { ok: false, message: 'A phone number or email is needed so a specialist can reach them. Ask for one.' };
      }
      const { success } = await rateLimit(`ai:chat:lead:${ip}`, { maxRequests: 3, windowSeconds: 3600, failClosed: true });
      if (!success) {
        return { ok: false, message: 'Too many requests from this visitor. Ask them to call us or use the appraisal form instead.' };
      }

      try {
        const where = site ? site.domain : 'mayells.com';
        const { prospectId, created } = await recordConversationLead({
          name: input.name,
          phone: input.phone,
          email: input.email,
          town: input.town,
          items: input.items,
          site: site?.slug,
          source: 'website',
          origin: `Taken by the website chat on ${where}`,
        });

        const photos = chatPhotoDataUrls(messages);
        const attached = photos.length > 0
          ? await attachChatPhotos(prospectId, photos, input.items).catch((err) => {
              logger.error('Failed to attach chat photos', err, { prospectId });
              return 0;
            })
          : 0;

        // Site-wide daily ceiling on top of the per-IP limit: the chat is
        // public, and each send is Mayells-branded mail to a typed address.
        const emailAllowed = input.sendUploadLink && input.email
          ? (await rateLimit('ai:chat:upload-email:global', { maxRequests: 100, windowSeconds: 86400, failClosed: true })).success
          : false;
        const uploadLinkEmailed = emailAllowed && input.email
          ? await emailUploadLink({ id: prospectId, fullName: input.name, email: input.email })
          : false;

        const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/admin/prospects/${prospectId}`;
        sendAppraisalRequestNotification({
          name: input.name,
          phone: input.phone ?? 'not given',
          email: input.email,
          service: `Website chat (${created ? 'new lead' : 'repeat contact, added to existing prospect'})`,
          items: [input.items, input.town ? `Town: ${input.town}` : null].filter(Boolean).join('\n'),
          message: `Taken by the website chat on ${where}.${attached ? ` ${attached} photo${attached === 1 ? '' : 's'} from the chat attached.` : ''}${uploadLinkEmailed ? ' Upload link emailed.' : ''} Prospect: ${adminUrl}`,
          site: site ? { city: site.city, domain: site.domain } : undefined,
        }).catch((err) => logger.error('Failed to send chat lead notification', err, { prospectId }));

        return {
          ok: true,
          photosAttached: attached,
          uploadLinkEmailed,
          message: 'Request recorded. A specialist will be in touch.',
        };
      } catch (err) {
        logger.error('Chat appraisal request failed', err);
        return { ok: false, message: 'Could not save the request. Ask them to call us or use the appraisal form.' };
      }
    },
  });
}
