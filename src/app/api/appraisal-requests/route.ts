import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { z } from 'zod';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { instantEstimate } from '@/lib/ai/instant-estimate';

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
});

// Storage paths minted by /api/appraisal-requests/upload-urls. Strict shape
// so a caller can't reference objects outside the public submissions folder.
const PHOTO_PATH_RE = /^submissions\/[a-z0-9.-]+$/i;

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Downscaled, re-encoded rendition for the vision model: cheaper and faster
// than full-size originals, and converts HEIC (iPhone) photos to a format
// the model can ingest. The admin email keeps the originals.
function aiRenditionUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${path}?width=1024&quality=80`;
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

      const photos = formData.getAll('photos') as File[];
      if (photos.length > 0) {
        const admin = createAdminClient();
        const uploadPromises = photos
          // Enforce the declared allow-list: reject empty/oversized files AND
          // anything that isn't an accepted image type (this is a public,
          // unauthenticated endpoint writing to a public bucket).
          .filter((p) => p.size > 0 && p.size <= MAX_FILE_SIZE && ALLOWED_TYPES.includes(p.type))
          .map(async (photo) => {
            const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
            const path = `submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { data, error } = await admin.storage
              .from(BUCKET)
              .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
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
          const rows = await db.execute(
            // drizzle expands a JS array param to ($1, $2, ...) — IN-list form
            sql`select name from storage.objects where bucket_id = ${BUCKET} and name in ${candidates}`,
          );
          const existingNames = new Set((rows as unknown as { name: string }[]).map((r) => r.name));
          const verified = candidates.filter((p) => existingNames.has(p));
          photoUrls = verified.map(publicUrl);
          aiImageUrls = verified.map(aiRenditionUrl);
        }
      }
    }

    const parsed = appraisalSchema.safeParse({ name, phone, email, items, service, message });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    ({ name, phone, email, items, service, message } = parsed.data as typeof parsed.data & { name: string; phone: string });

    // Preliminary AI estimate for the prospect. Strictly best-effort: any
    // failure (model down, unparseable photos) must not fail the request.
    const estimate = aiImageUrls.length > 0
      ? await instantEstimate({ imageUrls: aiImageUrls, itemsDescription: items })
      : null;

    sendAppraisalRequestNotification(
      { name, phone, email, service, items, message },
      photoUrls,
      estimate,
    ).catch((err) =>
      logger.error('Failed to send appraisal notification', err),
    );

    return NextResponse.json(
      {
        data: {
          message: 'Request submitted successfully',
          estimate: estimate
            ? {
                estimateLow: estimate.estimateLow,
                estimateHigh: estimate.estimateHigh,
                confidence: estimate.confidence,
                summary: estimate.summary,
              }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('Appraisal request error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
