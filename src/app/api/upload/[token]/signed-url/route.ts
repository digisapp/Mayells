import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateLink } from '@/lib/upload/validate-link';
import { db } from '@/db';
import { uploadLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { z } from 'zod';
import {
  UPLOAD_ALLOWED_TYPES,
  UNSUPPORTED_TYPE_MESSAGE,
  isVideoType,
  maxBytesFor,
  tooLargeMessage,
} from '@/lib/upload/limits';

const BUCKET = 'lot-images';

// Types and size caps live in one place so the upload page can check a file
// (and explain the problem) before it spends the seller's data on it.
const signedUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // One signed URL per file. Generous for a large estate shoot, but a hard
    // wall against using a leaked or chat-minted link as unlimited storage.
    const [{ success: tokenOk }, { success: ipOk }] = await Promise.all([
      rateLimit(`upload-token-files:${token}`, { maxRequests: 500, windowSeconds: 3600 }),
      rateLimit(`upload-ip-files:${getClientIp(request)}`, { maxRequests: 500, windowSeconds: 3600 }),
    ]);
    if (!tokenOk || !ipOk) {
      return NextResponse.json({ error: 'Too many uploads. Please try again in an hour.' }, { status: 429 });
    }

    const row = await validateLink(token);
    if (!row) {
      return NextResponse.json({ error: 'Invalid upload link' }, { status: 404 });
    }

    const { link } = row;

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      if (link.status === 'active') {
        await db
          .update(uploadLinks)
          .set({ status: 'expired' })
          .where(eq(uploadLinks.id, link.id));
      }
      return NextResponse.json({ error: 'This upload link has expired' }, { status: 410 });
    }

    if (link.status !== 'active') {
      return NextResponse.json({ error: 'This upload link is no longer active' }, { status: 410 });
    }

    const parsed = signedUrlSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing filename, contentType, or fileSize' }, { status: 400 });
    }
    const { filename, contentType, fileSize } = parsed.data;

    if (!UPLOAD_ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: UNSUPPORTED_TYPE_MESSAGE }, { status: 400 });
    }

    const isVideo = isVideoType(contentType);

    if (fileSize > maxBytesFor(contentType)) {
      return NextResponse.json(
        { error: tooLargeMessage({ bytes: fileSize, isVideo }) },
        { status: 400 }
      );
    }

    // Generate storage path
    // Only a-z0-9 may reach the storage key (no path segments / odd chars).
    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || (isVideo ? 'mp4' : 'jpg');
    const storagePath = `uploads/${link.prospectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      logger.error('Failed to create signed upload URL', error);
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
    }

    // Get the public URL for after upload completes
    const { data: { publicUrl } } = admin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl,
    });
  } catch (error) {
    logger.error('Signed URL error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
