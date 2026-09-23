import crypto from 'crypto';
import { db } from '@/db';
import { sellerProspects, uploadLinks, uploadItems } from '@/db/schema';
import { and, desc, eq, gt, gte, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import { sendUploadLinkNotification } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripImageMetadata } from '@/lib/images/sanitize';

/** A repeat call or chat inside this window adds to the open prospect instead of starting another. */
const DEDUPE_DAYS = 90;

export interface ConversationLead {
  name: string;
  phone?: string;
  email?: string;
  /** Town or neighbourhood the caller gave, stored as the prospect's city. */
  town?: string;
  /** What they have, in their words as the agent recorded it. */
  items: string;
  estimatedItemCount?: number;
  /** City microsite slug, already validated by the caller of this function. */
  site?: string;
  source: 'phone' | 'website';
  /** One line on where this came from, e.g. "Taken by the AI phone concierge on the Jupiter line". */
  origin: string;
}

function lastTenDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Record a lead taken in conversation (voice concierge or website chat).
 *
 * People call back, and they call after filling in the form. A prospect
 * still in play with the same phone or email from the last 90 days gets the
 * new details appended to its notes rather than a duplicate row, so the
 * admin sees one person with one history.
 *
 * Nobody on a chat or a phone line has proved who they are, so a match only
 * merges when the contact details agree: the same email, or a phone match
 * with no conflicting email. Otherwise a stranger who typed someone's phone
 * number next to their own address would take over that person's prospect,
 * and the upload link emailed back would be the victim's. A conflicting
 * lead becomes its own prospect, noted as a possible duplicate.
 */
export async function recordConversationLead(lead: ConversationLead): Promise<{ prospectId: string; created: boolean }> {
  const phoneKey = lead.phone ? lastTenDigits(lead.phone) : null;
  const email = lead.email?.trim().toLowerCase() || null;
  const stamp = `[${new Date().toISOString()}] ${lead.origin}`;

  const matchers = [
    phoneKey ? sql`right(regexp_replace(${sellerProspects.phone}, '\\D', '', 'g'), 10) = ${phoneKey}` : null,
    email ? sql`lower(${sellerProspects.email}) = ${email}` : null,
  ].filter((m) => m !== null);

  let possibleDuplicateOf: string | null = null;

  if (matchers.length > 0) {
    const since = new Date(Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: sellerProspects.id, email: sellerProspects.email })
      .from(sellerProspects)
      .where(
        and(
          or(...matchers),
          gte(sellerProspects.createdAt, since),
          notInArray(sellerProspects.status, ['declined', 'archived']),
        ),
      )
      .orderBy(desc(sellerProspects.createdAt))
      .limit(1);

    const existingEmail = existing?.email?.trim().toLowerCase() || null;
    const agrees = existing && (!email || existingEmail === email);

    if (existing && agrees) {
      const addition = [
        stamp,
        `Name given: ${lead.name}`,
        lead.town ? `Town: ${lead.town}` : null,
        `Items: ${lead.items}`,
      ].filter(Boolean).join('\n');
      await db
        .update(sellerProspects)
        .set({
          // Appended in SQL so a call and a chat landing together both keep their notes.
          notes: sql`concat_ws(E'\n\n', ${sellerProspects.notes}, ${addition}::text)`,
          updatedAt: new Date(),
        })
        .where(eq(sellerProspects.id, existing.id));
      return { prospectId: existing.id, created: false };
    }
    if (existing) possibleDuplicateOf = existing.id;
  }

  const [prospect] = await db
    .insert(sellerProspects)
    .values({
      fullName: lead.name,
      email,
      phone: lead.phone || null,
      city: lead.town || null,
      source: lead.source,
      sourceNotes: lead.origin,
      site: lead.site ?? null,
      itemSummary: lead.items,
      estimatedItemCount: lead.estimatedItemCount ?? null,
      status: 'new',
      notes: possibleDuplicateOf
        ? `Possible duplicate of prospect ${possibleDuplicateOf}: same phone or email, different contact details. Check before merging.`
        : null,
    })
    .returning({ id: sellerProspects.id });

  return { prospectId: prospect.id, created: true };
}

export function uploadUrlForToken(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/upload/${token}`;
}

/**
 * The prospect's usable upload link, minting one if none is active. Reusing
 * matters: the seller may already hold the first URL, and two live tokens
 * for one consignment is one more to expire later. A fresh lead moves to
 * `upload_sent`; one further along is never dragged back up the funnel.
 */
export async function getOrCreateUploadLink(
  prospectId: string,
  options: { maxItems?: number | null; expiresInDays?: number | null } = {},
) {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(uploadLinks)
    .where(
      and(
        eq(uploadLinks.prospectId, prospectId),
        eq(uploadLinks.status, 'active'),
        or(isNull(uploadLinks.expiresAt), gt(uploadLinks.expiresAt, now)),
      ),
    )
    .orderBy(desc(uploadLinks.createdAt))
    .limit(1);

  let link = existing;
  if (!link) {
    let expiresAt: Date | null = null;
    if (options.expiresInDays) {
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }
    [link] = await db
      .insert(uploadLinks)
      .values({
        prospectId,
        token: crypto.randomUUID(),
        maxItems: options.maxItems ?? null,
        expiresAt,
      })
      .returning();
  }

  await db
    .update(sellerProspects)
    .set({ status: 'upload_sent', updatedAt: now })
    .where(and(eq(sellerProspects.id, prospectId), inArray(sellerProspects.status, ['new', 'contacted'])));

  return { link, reused: Boolean(existing), url: uploadUrlForToken(link.token) };
}

/**
 * Email a prospect their photo upload link. Returns false (and logs) rather
 * than throwing: the lead is already saved, and a failed email is something
 * the admin can resend from the prospect page.
 */
export async function emailUploadLink(prospect: { id: string; fullName: string; email: string | null }, message?: string): Promise<boolean> {
  if (!prospect.email || isSentinelEmail(prospect.email)) return false;
  const { url } = await getOrCreateUploadLink(prospect.id);
  try {
    await sendUploadLinkNotification({
      prospectEmail: prospect.email,
      prospectName: prospect.fullName,
      uploadUrl: url,
      message,
    });
    return true;
  } catch (err) {
    logger.error('Failed to send upload link email', err, { prospectId: prospect.id });
    return false;
  }
}

const PHOTO_BUCKET = 'lot-images';
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Attach photos a visitor already shared in the website chat to their
 * prospect, so they are not asked to upload the same pictures again.
 *
 * The photos arrive as data URLs inside the chat request. Each is re-encoded
 * (which drops EXIF, including GPS), stored where website submissions go, and
 * becomes one upload item under a synthetic, already-completed upload link —
 * the same shape the appraisal form produces. Returns how many were saved.
 */
export async function attachChatPhotos(prospectId: string, dataUrls: string[], note: string): Promise<number> {
  const admin = createAdminClient();
  const stored: string[] = [];

  for (const dataUrl of dataUrls.slice(0, 5)) {
    const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
    const ext = match ? PHOTO_TYPES[match[1]] : undefined;
    if (!match || !ext) continue;
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) continue;

    const stripped = await stripImageMetadata(bytes);
    if (!stripped) continue;
    const path = `submissions/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { data, error } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(path, stripped.buffer, { contentType: stripped.contentType, upsert: false });
    if (error) {
      logger.error('Chat photo upload failed', error, { prospectId });
      continue;
    }
    stored.push(admin.storage.from(PHOTO_BUCKET).getPublicUrl(data.path).data.publicUrl);
  }

  if (stored.length === 0) return 0;

  const [link] = await db
    .insert(uploadLinks)
    .values({
      prospectId,
      token: crypto.randomUUID(),
      // Never shared: exists only as the join the prospects funnel expects.
      status: 'completed',
      itemCount: stored.length,
      lastUploadAt: new Date(),
    })
    .returning({ id: uploadLinks.id });

  await db.insert(uploadItems).values(
    stored.map((url, index) => ({
      uploadLinkId: link.id,
      prospectId,
      images: [url],
      sellerNotes: note,
      sortOrder: index,
      status: 'uploaded' as const,
    })),
  );

  await db
    .update(sellerProspects)
    .set({
      totalItems: sql`${sellerProspects.totalItems} + ${stored.length}`,
      status: sql`CASE WHEN ${sellerProspects.status} IN ('new', 'contacted', 'upload_sent') THEN 'items_received' ELSE ${sellerProspects.status} END`,
      updatedAt: new Date(),
    })
    .where(eq(sellerProspects.id, prospectId));

  return stored.length;
}
