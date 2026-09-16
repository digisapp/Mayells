import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Admin direct-to-storage uploads.
 *
 * `POST /api/upload` streams the file through this Next route, which on
 * Vercel hits the ~4.5 MB request-body cap before the route's own size check
 * runs — large phone photos simply fail. Mirroring the seller flow
 * (`/api/upload/[token]/signed-url`), this hands the admin a short-lived
 * signed URL so the bytes go straight to Supabase Storage. Same bucket and
 * key convention as `/api/upload` (`<userId>/<ts>-<rand>.<ext>`), so every
 * other piece of code that derives a storage path from a public URL keeps
 * working.
 *
 * EXIF/GPS scrubbing happens at the persistence points (lot images POST,
 * appraisal items POST) via `sanitizeStoredImages`, exactly as the seller
 * flow does in its items POST — the bytes never pass through our server here.
 */

const BUCKET = 'lot-images';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];
const MAX_SIZE = 15 * 1024 * 1024; // 15MB — same as the seller flow

const signedUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = signedUrlSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing filename, contentType, or fileSize' }, { status: 400 });
    }
    const { filename, contentType, fileSize } = parsed.data;

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: JPEG, PNG, WebP, AVIF, HEIC.' },
        { status: 400 },
      );
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 15MB.' }, { status: 400 });
    }

    // Only a-z0-9 may reach the storage key — a crafted filename must not be
    // able to inject path segments or odd characters into the object path.
    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
    const storagePath = `${admin.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const storage = createAdminClient().storage.from(BUCKET);
    const { data, error } = await storage.createSignedUploadUrl(storagePath);
    if (error) {
      logger.error('Failed to create admin signed upload URL', error);
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
    }

    const { data: { publicUrl } } = storage.getPublicUrl(storagePath);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl,
    });
  } catch (error) {
    logger.error('Admin signed URL error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
