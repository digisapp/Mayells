import { NextRequest, NextResponse, after } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/db';
import { and, arrayOverlaps, asc, desc, eq, like, sql } from 'drizzle-orm';
import { sellerProspects, uploadLinks, uploadItems } from '@/db/schema';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { redis, isRedisConfigured } from '@/lib/redis';
import {
  RESUBMIT_WINDOW_MINUTES,
  parseSubmissionId,
  planResubmission,
  resubmissionKey,
  submissionMarker,
  type LeadForm,
} from '@/lib/upload/resubmission';
import { createAdminClient } from '@/lib/supabase/admin';
import { supabaseUrl } from '@/lib/supabase/env';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { instantEstimate, type InstantEstimate } from '@/lib/ai/instant-estimate';
import { stripImageMetadata, sanitizeStoredImages } from '@/lib/images/sanitize';
import { stripHeifMetadata } from '@/lib/upload/strip-heic-location';
import { formatCurrency } from '@/types';
import { getMicrositeBySlug } from '@/lib/microsites/config';

// Photo uploads plus a vision-model estimate can exceed the default timeout.
export const maxDuration = 60;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per file
const BUCKET = 'lot-images';

const appraisalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().min(1, 'Phone is required').max(50),
  email: z.string().email('Invalid email').max(320).optional().or(z.literal('')),
  items: z.string().max(5000).optional(),
  service: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  // Which property the lead came from: a city microsite slug
  // (see src/lib/microsites/config.ts) or undefined for mayells.com itself.
  // Constrained to a slug so it can't be used to inject text into the
  // admin-facing source notes.
  site: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid site').optional(),
});

// Storage paths minted by /api/appraisal-requests/upload-urls. Strict shape
// so a caller can't reference objects outside the public submissions folder.
const PHOTO_PATH_RE = /^submissions\/[a-z0-9.-]+$/i;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The estimate as the form shows it. */
interface PublicEstimate {
  estimateLow: number;
  estimateHigh: number;
  confidence: InstantEstimate['confidence'];
  summary: string;
}

function publicEstimate(estimate: InstantEstimate | null): PublicEstimate | null {
  return estimate
    ? {
        estimateLow: estimate.estimateLow,
        estimateHigh: estimate.estimateHigh,
        confidence: estimate.confidence,
        summary: estimate.summary,
      }
    : null;
}

function submitted(estimate: PublicEstimate | null) {
  return NextResponse.json({ data: { message: 'Request submitted successfully', estimate } }, { status: 201 });
}

function publicUrl(path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Downscaled, re-encoded rendition for the vision model: cheaper and faster
// than full-size originals, and converts HEIC (iPhone) photos to a format
// the model can ingest. The admin email keeps the originals.
function aiRenditionUrl(path: string): string {
  return `${supabaseUrl()}/storage/v1/render/image/public/${BUCKET}/${path}?width=1024&quality=80`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { success: allowed } = await rateLimit(`appraisal:${ip}`, {
      maxRequests: 5,
      windowSeconds: 3600,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const contentType = req.headers.get('content-type') || '';

    let name: string;
    let phone: string;
    let items: string | undefined;
    let email: string | undefined;
    let service: string | undefined;
    let message: string | undefined;
    let site: string | undefined;
    let hp: unknown;
    let submissionId: string | null;
    let photoUrls: string[] = [];
    let aiImageUrls: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      name = formData.get('name') as string;
      phone = formData.get('phone') as string;
      items = (formData.get('items') as string) || undefined;
      email = (formData.get('email') as string) || undefined;
      service = (formData.get('service') as string) || undefined;
      message = (formData.get('message') as string) || undefined;
      site = (formData.get('site') as string) || undefined;
      hp = formData.get('hp');
      // Legacy path (no form posts files here now): each send stores its
      // photos afresh under new names, so a resend can't be matched to the
      // first by its photos, and merging would only duplicate them.
      submissionId = null;

      const photos = formData.getAll('photos') as File[];
      if (photos.length > 0) {
        const admin = createAdminClient();
        const uploadPromises = photos
          // Enforce the declared allow-list: reject empty/oversized files AND
          // anything that isn't an accepted image type (this is a public,
          // unauthenticated endpoint writing to a public bucket).
          .filter((p) => p.size > 0 && p.size <= MAX_FILE_SIZE && ALLOWED_TYPES.includes(p.type))
          .map(async (photo) => {
            const ext = photo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
            const path = `submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const bytes = Buffer.from(await photo.arrayBuffer());
            const stripped = await stripImageMetadata(bytes);
            if (!stripped) {
              // sharp can't read HEIC: blank its Exif/XMP items in place, and
              // drop one we can't patch rather than publish its location.
              const heif = stripHeifMetadata(bytes);
              if (!heif.ok && heif.reason === 'unsupported') {
                logger.warn('HEIF location could not be removed; photo dropped', { detail: heif.detail });
                return null;
              }
            }
            const { data, error } = await admin.storage
              .from(BUCKET)
              .upload(path, stripped?.buffer ?? bytes, {
                contentType: stripped?.contentType ?? photo.type ?? 'image/jpeg',
                upsert: false,
              });
            if (error) {
              logger.error('Photo upload error', error);
              return null;
            }
            const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(data.path);
            return publicUrl;
          });

        const results = await Promise.all(uploadPromises);
        photoUrls = results.filter((url): url is string => url !== null);
        aiImageUrls = photoUrls;
      }
    } else {
      const body = await req.json();
      name = body.name;
      phone = body.phone;
      items = body.items;
      email = body.email;
      service = body.service;
      message = body.message;
      site = body.site;
      hp = body.hp;
      submissionId = parseSubmissionId(body.submissionId);

      // Preferred flow: photos were already uploaded directly to storage via
      // signed URLs (Vercel caps request bodies at ~4.5MB, so file bytes
      // can't come through this route). Verify each claimed path actually
      // exists before referencing it anywhere.
      const rawPaths: unknown = body.photoPaths;
      if (Array.isArray(rawPaths) && rawPaths.length > 0) {
        const candidates = rawPaths
          .filter((p): p is string => typeof p === 'string' && PHOTO_PATH_RE.test(p))
          .slice(0, 50);
        if (candidates.length > 0) {
          const result = await db.execute(
            // drizzle expands a JS array param to ($1, $2, ...) — IN-list form
            sql`select name from storage.objects where bucket_id = ${BUCKET} and name in ${candidates}`,
          );
          // node-postgres returns a QueryResult (rows on `.rows`); guard the
          // bare-array shape too so a driver swap doesn't break verification.
          const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as { name: string }[];
          const existingNames = new Set(rows.map((r) => r.name));
          const verified = candidates.filter((p) => existingNames.has(p));
          photoUrls = verified.map(publicUrl);
          aiImageUrls = verified.map(aiRenditionUrl);
          // Direct-to-storage uploads bypass the server, so EXIF (incl. GPS)
          // is scrubbed after the response — the paths, and thus URLs, stay
          // the same.
          after(() => sanitizeStoredImages(verified));
        }
      }
    }

    // Honeypot (see CityConsignForm). A filled field means a bot, so answer
    // exactly as a success would — a distinguishable response just teaches
    // the bot which field to leave blank — and write nothing.
    if (typeof hp === 'string' && hp.trim().length > 0) {
      // Logged (no contact details) so a real visitor tripping it shows up.
      logger.warn('Appraisal honeypot filled; request dropped', { site, hpLength: hp.length, hasEmail: !!email });
      return NextResponse.json(
        { data: { message: 'Request submitted successfully', estimate: null } },
        { status: 201 },
      );
    }

    const parsed = appraisalSchema.safeParse({ name, phone, email, items, service, message, site });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    ({ name, phone, email, items, service, message, site } = parsed.data as typeof parsed.data & { name: string; phone: string });
    // Only a live microsite slug attributes the lead; anything else is
    // treated as mayells.com rather than stored as an unknown city.
    const microsite = site ? getMicrositeBySlug(site) : undefined;
    site = microsite?.slug;
    const form = { name, phone, email, items, service, message, site };

    // A resend of a request already saved: the phone locked or lost signal
    // after we saved it, so the seller saw an error and tried again, with
    // the same form id and the same photos. It gets the first one's answer
    // and adds nothing but what's new, checked before another AI estimate
    // is paid for. A DB hiccup here just means it's treated as new.
    const resendKey = resubmissionKey(submissionId, photoUrls);
    if (resendKey) {
      try {
        const original = await db.transaction((tx) => mergeResubmission(tx, resendKey, submissionId, form, photoUrls));
        if (original) return submitted(await rememberedEstimate(original));
      } catch (err) {
        logger.error('Appraisal resubmission check failed', err);
      }
    }

    // Preliminary AI estimate for the prospect. Strictly best-effort: any
    // failure (model down, unparseable photos) must not fail the request.
    const estimate = aiImageUrls.length > 0
      ? await instantEstimate({ imageUrls: aiImageUrls, itemsDescription: items })
      : null;

    // Create a seller_prospects row so the lead lands in the admin Prospects
    // funnel (previously it only existed as an email + loose storage photos).
    // Under the same lock as the check above, and checking again, so a
    // retry that raced this request (both past the check while the estimate
    // ran) can't create a second prospect.
    // Best-effort: a DB hiccup must not fail the request — the admin
    // notification email below still carries the full lead.
    try {
      const saved = await db.transaction(async (tx) => {
        if (resendKey) {
          const original = await mergeResubmission(tx, resendKey, submissionId, form, photoUrls);
          if (original) return { prospectId: original, created: false };
        }
        return { prospectId: await createProspectFromSubmission(tx, form, photoUrls, estimate, submissionId), created: true };
      });
      if (!saved.created) return submitted(publicEstimate(estimate));
      if (estimate) after(() => rememberEstimate(saved.prospectId, estimate));
    } catch (err) {
      logger.error('Failed to create prospect from appraisal request', err);
    }

    // after(): a promise left dangling past the response can be cut off
    // when the function is frozen, and the admin never hears of the lead.
    after(() =>
      sendAppraisalRequestNotification(
        { name, phone, email, service, items, message, site: microsite ? { city: microsite.city, domain: microsite.domain } : undefined },
        photoUrls,
        estimate,
      ).catch((err) =>
        logger.error('Failed to send appraisal notification', err),
      ),
    );

    return submitted(publicEstimate(estimate));
  } catch (error) {
    logger.error('Appraisal request error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Resends ──────────────────────────────────────────────────────────────

const RECENT = sql.raw(`now() - interval '${RESUBMIT_WINDOW_MINUTES} minutes'`);

/**
 * The prospect an earlier send of this request created, if it is recent:
 * found by the form id in its source notes or, failing that, by any of the
 * same photos (every upload has its own storage path).
 */
async function findOriginal(tx: Tx, submissionId: string | null, photoUrls: string[]) {
  const columns = {
    id: sellerProspects.id,
    fullName: sellerProspects.fullName,
    phone: sellerProspects.phone,
    email: sellerProspects.email,
    itemSummary: sellerProspects.itemSummary,
  };
  const recent = and(eq(sellerProspects.source, 'website'), sql`${sellerProspects.createdAt} > ${RECENT}`);
  if (submissionId) {
    const [byForm] = await tx
      .select(columns)
      .from(sellerProspects)
      .where(and(recent, like(sellerProspects.sourceNotes, `%${submissionMarker(submissionId)}%`)))
      .orderBy(asc(sellerProspects.createdAt))
      .limit(1);
    if (byForm) return byForm;
  }
  if (photoUrls.length === 0) return null;
  const [byPhoto] = await tx
    .select(columns)
    .from(sellerProspects)
    .innerJoin(uploadItems, eq(uploadItems.prospectId, sellerProspects.id))
    .where(and(recent, arrayOverlaps(uploadItems.images, photoUrls)))
    .orderBy(asc(sellerProspects.createdAt))
    .limit(1);
  return byPhoto ?? null;
}

/**
 * If this request was already saved, fold the resend into it and return the
 * prospect's id; otherwise null. Takes the request's advisory lock, held
 * until the caller's transaction ends, so the caller can create the
 * prospect under it when this finds none.
 */
async function mergeResubmission(
  tx: Tx,
  key: string,
  submissionId: string | null,
  form: LeadForm,
  photoUrls: string[],
): Promise<string | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appraisal-request:${key}`}::text))`);
  const original = await findOriginal(tx, submissionId, photoUrls);
  if (!original) return null;

  const attached = await tx
    .select({ images: uploadItems.images })
    .from(uploadItems)
    .where(eq(uploadItems.prospectId, original.id));
  const plan = planResubmission(
    { ...original, attachedUrls: attached.flatMap((row) => row.images ?? []) },
    form,
    photoUrls,
    new Date(),
  );
  if (plan.addPhotos.length > 0) await attachSubmissionPhotos(tx, original.id, plan.addPhotos, form.items || null);
  if (plan.note) {
    await tx
      .update(sellerProspects)
      .set({
        notes: sql`concat_ws(E'\n\n', ${sellerProspects.notes}, ${plan.note}::text)`,
        updatedAt: new Date(),
      })
      .where(eq(sellerProspects.id, original.id));
  }
  logger.info('Appraisal request resent; answered from the original', {
    prospectId: original.id,
    photosAdded: plan.addPhotos.length,
    changed: plan.note !== null,
  });
  return original.id;
}

// The estimate the first send showed, kept for the window a resend can
// arrive in, so the resend's answer shows it too. Redis, best-effort: without
// it the resend still succeeds, just without the estimate.
const estimateKey = (prospectId: string) => `appraisal:estimate:${prospectId}`;

async function rememberEstimate(prospectId: string, estimate: InstantEstimate): Promise<void> {
  if (!isRedisConfigured) return;
  try {
    await redis.set(estimateKey(prospectId), publicEstimate(estimate), { ex: RESUBMIT_WINDOW_MINUTES * 60 });
  } catch (err) {
    logger.warn('Could not keep the estimate for a resend', { prospectId, error: String(err) });
  }
}

async function rememberedEstimate(prospectId: string): Promise<PublicEstimate | null> {
  if (!isRedisConfigured) return null;
  try {
    return (await redis.get<PublicEstimate>(estimateKey(prospectId))) ?? null;
  } catch {
    return null;
  }
}

// ── New prospects ────────────────────────────────────────────────────────

/**
 * Turn a website consign/appraisal submission into a seller prospect, and
 * return its id.
 *
 * Photos are attached the way the prospects funnel expects: a synthetic
 * (already-completed, never-shared) upload link owned by the prospect, with
 * ONE upload item per photo in 'uploaded' status — the website form gives no
 * way to group photos by piece, and one item per photo lets the admin
 * catalog, accept, or decline each piece independently (exactly as items
 * sent through /upload/[token] are handled).
 */
async function createProspectFromSubmission(
  tx: Tx,
  form: {
    name: string;
    phone: string;
    email?: string;
    items?: string;
    service?: string;
    message?: string;
    site?: string;
  },
  photoUrls: string[],
  estimate: InstantEstimate | null,
  submissionId: string | null,
): Promise<string> {
  const origin = form.site
    ? `Submitted via the ${getMicrositeBySlug(form.site)?.domain ?? form.site} city microsite`
    : 'Submitted via mayells.com consign/appraisal form';

  const sourceNotes = [
    origin,
    form.service ? `Service requested: ${form.service}` : null,
    form.message ? `Message: ${form.message}` : null,
    // How a resend of this same form fill finds this prospect.
    submissionId ? submissionMarker(submissionId) : null,
  ]
    .filter(Boolean)
    .join('\n');

  const notes = estimate
    ? `[${new Date().toISOString()}] AI instant estimate shown on site: ${formatCurrency(estimate.estimateLow)} – ${formatCurrency(estimate.estimateHigh)} (${estimate.confidence} confidence). ${estimate.summary}`
    : null;

  const [prospect] = await tx
    .insert(sellerProspects)
    .values({
      fullName: form.name,
      email: form.email || null,
      phone: form.phone,
      source: 'website',
      sourceNotes,
      site: form.site ?? null,
      itemSummary: form.items || null,
      notes,
      // attachSubmissionPhotos moves a prospect with photos on to the
      // needs-review state the admin list surfaces; without photos it
      // stays a fresh lead.
      status: 'new',
      totalItems: 0,
    })
    .returning({ id: sellerProspects.id });

  if (photoUrls.length > 0) await attachSubmissionPhotos(tx, prospect.id, photoUrls, form.items || null);
  return prospect.id;
}

/**
 * Add website-form photos to a prospect, one upload item each, under its
 * synthetic upload link (made on first use).
 */
async function attachSubmissionPhotos(tx: Tx, prospectId: string, photoUrls: string[], sellerNotes: string | null) {
  const [last] = await tx
    .select({ linkId: uploadItems.uploadLinkId, sortOrder: uploadItems.sortOrder })
    .from(uploadItems)
    .where(eq(uploadItems.prospectId, prospectId))
    .orderBy(desc(uploadItems.sortOrder))
    .limit(1);

  const now = new Date();
  let linkId = last?.linkId;
  if (linkId) {
    await tx
      .update(uploadLinks)
      .set({ itemCount: sql`${uploadLinks.itemCount} + ${photoUrls.length}`, lastUploadAt: now })
      .where(eq(uploadLinks.id, linkId));
  } else {
    const [link] = await tx
      .insert(uploadLinks)
      .values({
        prospectId,
        token: crypto.randomUUID(),
        // 'completed' so the token can never be used on /upload/[token] — it
        // exists purely as the join the prospects funnel expects.
        status: 'completed',
        itemCount: photoUrls.length,
        lastUploadAt: now,
      })
      .returning({ id: uploadLinks.id });
    linkId = link.id;
  }

  const baseOrder = (last?.sortOrder ?? -1) + 1;
  await tx.insert(uploadItems).values(
    photoUrls.map((url, index) => ({
      uploadLinkId: linkId,
      prospectId,
      images: [url],
      // The form's free-text item description applies to the whole
      // submission; keep it on every item so the reviewer sees it in context.
      sellerNotes,
      sortOrder: baseOrder + index,
      status: 'uploaded' as const,
    })),
  );

  await tx
    .update(sellerProspects)
    .set({
      totalItems: sql`${sellerProspects.totalItems} + ${photoUrls.length}`,
      status: sql`CASE WHEN ${sellerProspects.status} IN ('new', 'contacted', 'upload_sent') THEN 'items_received' ELSE ${sellerProspects.status} END`,
      updatedAt: now,
    })
    .where(eq(sellerProspects.id, prospectId));
}
