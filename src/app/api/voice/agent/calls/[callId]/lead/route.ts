import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { calls, sellerProspects } from '@/db/schema';
import { rejectUnlessVoiceAgent } from '@/lib/voice/agent-auth';
import { recordConversationLead, emailUploadLink } from '@/lib/prospects/intake';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { getMicrositeBySlug } from '@/lib/microsites/config';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

const leadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).optional(),
  // Speech-to-text mangles emails ("john at gmail dot com") and counts. A bad
  // optional field must not throw away the caller's name, number and items,
  // so these are checked below and kept as a note when they don't parse.
  email: z.string().trim().max(320).optional(),
  town: z.string().trim().max(200).optional(),
  items: z.string().trim().min(1).max(3000),
  estimatedItemCount: z.number().optional(),
  sendUploadLink: z.boolean().optional(),
});

/**
 * The agent's `record_appraisal_request` tool. Turns what the caller said
 * into a prospect (or adds to the one they already have), links it to the
 * call, emails the admin, and — when the caller gave an email and agreed —
 * sends them the photo upload link while they are still on the line.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const rejected = rejectUnlessVoiceAgent(req);
  if (rejected) return rejected;

  const { callId } = await params;
  if (!UUID_RE.test(callId)) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

  const parsed = leadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const raw = parsed.data;
  const emailOk = !!raw.email && z.email().safeParse(raw.email).success;
  const countOk = raw.estimatedItemCount !== undefined
    && Number.isInteger(raw.estimatedItemCount) && raw.estimatedItemCount >= 1 && raw.estimatedItemCount <= 100000;
  const unparsed = [
    raw.email && !emailOk ? `Email as heard (did not parse): ${raw.email}` : null,
    raw.estimatedItemCount !== undefined && !countOk ? `Item count as heard: ${raw.estimatedItemCount}` : null,
  ].filter(Boolean);
  const input = {
    ...raw,
    email: emailOk ? raw.email : undefined,
    estimatedItemCount: countOk ? raw.estimatedItemCount : undefined,
    items: unparsed.length ? `${raw.items}\n${unparsed.join('\n')}`.slice(0, 3200) : raw.items,
  };

  try {
    const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    const site = call.site ? getMicrositeBySlug(call.site) : undefined;
    // Caller ID is the fallback, not the default: people often ask to be
    // called back on a different number than the one they rang from.
    const phone = input.phone || call.callerNumber || undefined;
    const line = call.channel === 'web'
      ? `the website voice concierge${site ? ` on ${site.domain}` : ''}`
      : `the AI phone concierge on the ${site ? `${site.city} line` : 'main line'}`;

    const { prospectId, created } = await recordConversationLead({
      name: input.name,
      phone,
      email: input.email || undefined,
      town: input.town,
      items: input.items,
      estimatedItemCount: input.estimatedItemCount,
      site: site?.slug,
      source: 'phone',
      origin: `Taken by ${line}`,
    });

    await db.update(calls).set({ prospectId, outcome: 'lead' }).where(eq(calls.id, callId));

    let uploadLinkEmailed = false;
    if (input.sendUploadLink) {
      const [prospect] = await db
        .select({ id: sellerProspects.id, fullName: sellerProspects.fullName, email: sellerProspects.email })
        .from(sellerProspects)
        .where(eq(sellerProspects.id, prospectId))
        .limit(1);
      if (prospect) {
        // The address the caller just spelled out wins over an older one on file.
        uploadLinkEmailed = await emailUploadLink(
          { ...prospect, email: input.email || prospect.email },
          'As promised on the phone, here is the link for your photos.',
        );
      }
    }

    const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/admin/prospects/${prospectId}`;
    // after(): a dangling promise can be cut off once the response is sent.
    after(() =>
      sendAppraisalRequestNotification({
        name: input.name,
        phone: phone ?? 'not given',
        email: input.email || undefined,
        service: `Phone call (${created ? 'new lead' : 'repeat contact, added to existing prospect'})`,
        items: [input.items, input.town ? `Town: ${input.town}` : null, input.estimatedItemCount ? `About ${input.estimatedItemCount} items` : null]
          .filter(Boolean)
          .join('\n'),
        message: `Taken by ${line}.${uploadLinkEmailed ? ' Upload link emailed to the caller.' : ''} Prospect: ${adminUrl}`,
        site: site ? { city: site.city, domain: site.domain } : undefined,
      }).catch((err) => logger.error('Failed to send phone lead notification', err, { callId })),
    );

    return NextResponse.json({ data: { prospectId, created, uploadLinkEmailed } });
  } catch (error) {
    logger.error('Voice agent lead failed', error, { callId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
