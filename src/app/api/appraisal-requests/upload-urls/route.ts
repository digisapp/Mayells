import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/lib/request-ip';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// Mints short-lived signed upload URLs so appraisal photos go directly to
// storage from the browser — request bodies through this API are capped at
// ~4.5MB by the platform, which a single phone photo can exceed.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const BUCKET = 'lot-images';

const requestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().max(300),
        type: z.string().max(100),
        size: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    // Generous enough for a 50-photo estate submission plus retries, still a
    // hard wall against bulk abuse of the public bucket.
    const { success: allowed } = await rateLimit(`appraisal-upload:${ip}`, {
      maxRequests: 150,
      windowSeconds: 3600,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const admin = createAdminClient();
    const uploads: { index: number; path: string; signedUrl: string }[] = [];

    for (const [index, file] of parsed.data.files.entries()) {
      const isHeicName = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
      if (file.size > MAX_FILE_SIZE) continue;
      if (!ALLOWED_TYPES.includes(file.type) && !isHeicName) continue;

      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        logger.error('Signed upload URL error', error);
        continue;
      }
      uploads.push({ index, path, signedUrl: data.signedUrl });
    }

    return NextResponse.json({ data: { uploads } }, { status: 201 });
  } catch (error) {
    logger.error('Upload URL minting error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
