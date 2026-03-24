import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateLink } from '@/lib/upload/validate-link';
import { db } from '@/db';
import { uploadLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const BUCKET = 'lot-images';

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];

const VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

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

    const body = await request.json();
    const { filename, contentType, fileSize } = body;

    if (!filename || !contentType || !fileSize) {
      return NextResponse.json({ error: 'Missing filename, contentType, or fileSize' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: JPEG, PNG, WebP, AVIF, HEIC, MP4, MOV, WebM.' },
        { status: 400 }
      );
    }

    const isVideo = VIDEO_TYPES.includes(contentType);
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (fileSize > maxSize) {
      return NextResponse.json(
        { error: `File too large. Max ${isVideo ? '100MB' : '15MB'}.` },
        { status: 400 }
      );
    }

    // Generate storage path
    const ext = filename.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
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
